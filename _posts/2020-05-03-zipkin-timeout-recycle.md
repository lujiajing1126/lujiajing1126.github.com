---
layout: post
title:  "Zipkin/Brave中的Span超时回收机制"
date:   2020-05-03 22:03:00
categories: tracing
tags: [java,zipkin,brave,b3]
icon: "https://zipkin.io/public/img/logo_png/zipkin_vertical_grey_gb.png"
---

> 对 http://www.iocoder.cn/categories/Zipkin/ 的一些补充，分析基于Brave#release-5.11.2分支，可能未来会有所变化

> 开头先打个广告，我们团队目前正在找人，坐标上海，感兴趣可以投递呀，嘻嘻。[高级Java开发工程师（框架开发）](https://www.lagou.com/jobs/7082374.html?source=pl&i=pl-3&show=e9f2b043557641efa104fa8dbb7139e4)

今天我们来讲`Zipkin/Brave`中`Span`的超时回收机制。这里的"超时"是广义上的超时，一般是指由于`Span`停留在内存中的时间过久而触发的回收机制。超时的原因一般可以认为是程序对于`Span`的处理不当造成的，比如启动/创建了一个`Span`但由于某些原因没有关闭这个`Span`，从而导致内存泄露。

<!-- more -->

## Timeout或Deadline机制

在Twitter开发的RPC框架`Finagle`中我们可以找到这样的一个类[`DeadlineSpanMap`](https://github.com/twitter/finagle/blob/finagle-20.4.1/finagle-zipkin-core/src/main/scala/com/twitter/finagle/zipkin/core/DeadlineSpanMap.scala)，这个类会负责管理维护所有系统中的`Span`。以下`Finagle`的分析基于源码版本`finagle-20.4.1`。

根据文档，`DeadlineSpanMap`维护的Span会有三种可能的状态流转，

1. live -> on hold -> logged
2. live -> on hold -> flushed -> logged
3. live -> flushed -> logged

`DeadlineSpanMap`类的构造函数有三个参数，

- logSpans: Seq[Span] => Future[Unit] 用于记录Span，是一个函数，输入一个Span列表，返回一个Future
- ttl: Duration 过期时间TTL
- timer: Timer 定时器，用于设置定时任务
- hold: Duration = 500.milliseconds 表示Span几乎完成(Almost Complete)到从spanMap中被移除的时间，默认是500ms

我们可以通过测试用例来理解这三种不同的流转过程，

### live -> on hold -> logged

```scala
  /**
   * Tests state transition sequence (i): live -> on hold -> logged.
   * See the comment in DeadlineSpanMap.scala for more details.
   */
  test("The hold timer catches late spans and on expiry logs the span") {
    // 用于模拟当前的时间
    Time.withCurrentTimeFrozen { tc =>
      var spansLoggedCount = 0
      var annotationCount = 0
      // 记录span的数目以及注解annotation的数目
      val logger: Seq[Span] => Future[Unit] = { spans =>
        spans.foreach { span => annotationCount += span.annotations.length }
        spansLoggedCount += spans.size
        Future.Done
      }

      val timer = new MockTimer
      // TTL时间
      val ttl: Duration = 10.milliseconds
      // Hold时间
      val hold: Duration = 2.milliseconds
      val map = new DeadlineSpanMap(logger, ttl, timer, hold)
      val traceId = TraceId(Some(SpanId(123)), Some(SpanId(123)), SpanId(123), None)

      // 向Span添加一个注解,注解就是类似于Log一样的存在。后面会解释
      map.update(traceId)(
        _.addAnnotation(
          ZipkinAnnotation(Time.now, Constants.CLIENT_RECV, Endpoint.Unknown)
        )
      )

      // 将虚拟的时钟往前拨1ms，但不超过hold的时效
      tc.advance(1.milliseconds) // advance timer but not beyond the hold deadline
      timer.tick()

      // 增加另一个无意义的Annotation
      map.update(traceId)(
        _.addAnnotation(
          ZipkinAnnotation(Time.now, "Extra annotation", Endpoint.Unknown)
        )
      )

      // 将虚拟的时钟往前拨1ms，超过hold的时效，但不超过ttl
      tc.advance(1.milliseconds)
      timer.tick()

      // 将虚拟的时钟往前拨10ms，超过ttl
      tc.advance(10.milliseconds)
      timer.tick()

      // Span应该仅被记录了一次，而Annotation是两个
      assert(spansLoggedCount == 1, "Wrong number of calls to log spans")
      assert(annotationCount == 2, "Wrong number of annotations")
    }
  }
```

这个测试用例演绎了一次正常的状态流转。

第一次更新的Annotation（`Key=Constants.CLIENT_RECV, Value=Endpoint.Unknown`），表示一个RPC请求收到了对端(peer)的响应，根据[Zipkin的语义](https://zipkin.io/pages/instrumenting.html)，这个注解表示一个RPC请求已经几乎完成。那么，这个Span会被打上onHold的标签，表示Span即将完成，参考 [MutableSpan.scala](https://github.com/twitter/finagle/blob/finagle-20.4.1/finagle-zipkin-core/src/main/scala/com/twitter/finagle/zipkin/core/MutableSpan.scala#L74-L92)

如果调用`DeadlineSpanMap.update`方法以后，发现Span处于onHold状态，那么会在定时器上绑定一个`complete`钩子，在经过`hold`时间后（默认为500ms）触发complete方法，在这个方法中会把该Span从spanMap中移除，并调用logSpans方法记录这个Span。

### live -> on hold -> flushed -> logged

```scala
/**
   * Tests state transition sequence (ii): live -> on hold -> flushed -> logged.
   * See the comment in DeadlineSpanMap.scala for more details.
   */
  test("Even if on hold, the span is flushed if ttl expires first") {
    Time.withCurrentTimeFrozen { tc =>
      var spansLoggedCount = 0
      var annotationCount = 0
      val logger: Seq[Span] => Future[Unit] = { spans =>
        spans.foreach { span => annotationCount += span.annotations.length }
        spansLoggedCount += 1
        Future.Done
      }

      val timer = new MockTimer
      // 相比于(i)的测试用例，这里的ttl设定的很短
      val ttl: Duration = 1.milliseconds
      val hold: Duration = 2.milliseconds
      val map = new DeadlineSpanMap(logger, ttl, timer, hold)
      val traceId = TraceId(Some(SpanId(123)), Some(SpanId(123)), SpanId(123), None)

      // Add an annotation to transition the span to hold state.
      map.update(traceId)(
        _.addAnnotation(
          ZipkinAnnotation(Time.now, Constants.CLIENT_RECV, Endpoint.Unknown)
        )
      )

      tc.advance(1.milliseconds) // advance timer beyond the ttl
      timer.tick() // execute scheduled event

      // Add another annotation, which will be logged separately.
      map.update(traceId)(
        _.addAnnotation(
          ZipkinAnnotation(Time.now, "Extra annotation", Endpoint.Unknown)
        )
      )

      tc.advance(1.milliseconds) // advance timer beyond the ttl
      timer.tick() // execute scheduled event

      // Span must have been logged twice.
      assert(spansLoggedCount == 2, "Wrong number of calls to log spans")

      // Flushing adds a "finagle.flush" annotation and we have flushed twice.
      assert(annotationCount == 4, "Wrong number of annotations")
    }
  }
```

从测试用例的名称我们可以很容易理解这个状态，如果Span的完成耗时较长，那么即使已经设定了complete定时器，也有可以ttl定时器先被触发。此时的话，complete会被触发两次，一次是由timer上注册的`flushTask`任务触发的，

```scala
private class DeadlineSpanMap(
  logSpans: Seq[Span] => Future[Unit],
  ttl: Duration,
  timer: Timer,
  hold: Duration = 500.milliseconds) {
<SNIP>
private[this] val flushTask = timer.schedule(ttl / 2) { flush(ttl.ago) }
<SNIP>
}
```

另一次则是由于onHold状态被绑定的complete钩子触发的。

### live -> flushed -> logged

```scala
/**
   * Tests state transition sequence (iii): live -> flushed -> logged.
   * See the comment in DeadlineSpanMap.scala for more details.
   */
  test("DeadlineSpanMap should expire and log spans") {
    Time.withCurrentTimeFrozen { tc =>
      var spansLogged: Boolean = false
      val logger: Seq[Span] => Future[Unit] = { _ =>
        spansLogged = true
        Future.Done
      }

      val timer = new MockTimer
      val map = new DeadlineSpanMap(logger, 1.milliseconds, timer)
      val traceId = TraceId(Some(SpanId(123)), Some(SpanId(123)), SpanId(123), None)

      map.update(traceId)(_.setServiceName("service").setName("name"))
      tc.advance(10.seconds) // advance timer
      timer.tick() // execute scheduled event

      // span must have been logged
      assert(spansLogged)
    }
  }
```

最后一种情况就是由于超时被回收。

这种超时回收的机制比较微妙的地方是你需要知道应用中的Span大致的耗时，以便对ttl和onHold做出优化，如果ttl设定的太小，那么有可能你的业务还没执行完成，就已经被标记为超时而flush。如果ttl太大，则会浪费内存。

## Brave的新的"超时"机制

这里打上引号的原因是，Brave的这种机制本质上并不是根据时间来判断的，而且根据GC的压力来实现的。以下分析根据`openzipkin/brave#release-5.11.2`。

Brave中实现这个逻辑主要是在[`PendingSpans`](https://github.com/openzipkin/brave/blob/release-5.11.2/brave/src/main/java/brave/internal/recorder/PendingSpans.java)类中。

```java
public final class PendingSpans extends ReferenceQueue<TraceContext> {
  // Even though we only put by RealKey, we allow get and remove by LookupKey
  final ConcurrentMap<Object, PendingSpan> delegate = new ConcurrentHashMap<>(64);
<SNIP>
  public PendingSpan getOrCreate(TraceContext context, boolean start) {
    if (context == null) throw new NullPointerException("context == null");
    // 每次在创建MutableSpan的时候都会去检查OrphanedSpans
    reportOrphanedSpans();

<SNIP 省略创建MutableSpan和Clock的逻辑，留着以后分析> 

    // 把context封装成WeakRef的实现RealKey并放到ConcurrentHashMap中
    PendingSpan previousSpan = delegate.putIfAbsent(new RealKey(context, this), newSpan);
    if (previousSpan != null) return previousSpan; // lost race
    // 是否需要追踪OrphanSpan的创建用于诊断问题
    // 如果需要，则会跟踪响应的线程和堆栈(Throwable.fillInStackTrace())
    if (trackOrphans) {
      newSpan.caller =
        new Throwable("Thread " + Thread.currentThread().getName() + " allocated span here");
    }
    return newSpan;
  }
<SNIP>
}
```

那么这里我们可以看到其实这里的PendingSpans继承了ReferenceQueue，目的是为了能够回收WeakReference。不太熟悉的同学可以看官方的文档，

- https://docs.oracle.com/javase/8/docs/api/java/lang/ref/ReferenceQueue.html
- https://docs.oracle.com/javase/8/docs/api/java/lang/ref/WeakReference.html

> Creates a new weak reference that refers to the given object and is registered with the given queue.

在WeakReference的构造函数中可以传递一个ReferenceQueue用于收集那些被GC回收的引用。基于这个原理，可以实现超时回收的机制，具体来看一下代码。

```java
public final class PendingSpans extends ReferenceQueue<TraceContext> {
  // Even though we only put by RealKey, we allow get and remove by LookupKey
  final ConcurrentMap<Object, PendingSpan> delegate = new ConcurrentHashMap<>(64);
<SNIP>
  /** Reports spans orphaned by garbage collection. */
  void reportOrphanedSpans() {
    RealKey contextKey;
    // This is called on critical path of unrelated traced operations. If we have orphaned spans, be
    // careful to not penalize the performance of the caller. It is better to cache time when
    // flushing a span than hurt performance of unrelated operations by calling
    // currentTimeMicroseconds N times
    long flushTime = 0L;
    boolean noop = orphanedSpanHandler == FinishedSpanHandler.NOOP || this.noop.get();
    // 从ReferenceQueue中提取被回收的TraceContext
    while ((contextKey = (RealKey) poll()) != null) {
      // delegate里面保存的是TraceContext到PendingSpan的映射
      PendingSpan value = delegate.remove(contextKey);
      if (noop || value == null) continue;
      if (flushTime == 0L) flushTime = clock.currentTimeMicroseconds();

      boolean isEmpty = value.state.isEmpty();
      Throwable caller = value.caller;

      // 从回收的TraceContext信息恢复TraceContext对象
      TraceContext context = InternalPropagation.instance.newTraceContext(
        contextKey.flags,
        contextKey.traceIdHigh, contextKey.traceId,
        contextKey.localRootId, 0L, contextKey.spanId,
        Collections.emptyList()
      );

      if (caller != null) {
        String message = isEmpty
          ? "Span " + context + " was allocated but never used"
          : "Span " + context + " neither finished nor flushed before GC";
        Platform.get().log(message, caller);
      }
      if (isEmpty) continue;

      // 在MutableSpan中标记一个"brave.flush"事件
      value.state.annotate(flushTime, "brave.flush");
      // 调用相应的Handler来处理OrphanedSpan
      orphanedSpanHandler.handle(context, value.state);
    }
  }
<SNIP>
}
```

这里`PendingSpan value = delegate.remove(contextKey);`这句需要注意的是，实际上在这里比较HashCode和对象是否相同的时候，TraceContext重写了相关的方法，使得它可以直接和WeakReference进行对比。

关于`orphanedSpanHandler`，Brave自带的[`ZipkinFinishedSpanHandler`](https://github.com/openzipkin/brave/blob/release-5.11.2/brave/src/main/java/brave/internal/handler/ZipkinFinishedSpanHandler.java)就是一个支持OrphanedSpans的Handler。

那么，以上就是Brave/Zipkin支持超时回收机制的始末和相关原理。
