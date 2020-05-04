---
layout: post
title:  "分析Brave/Jaeger/Skywalking中时钟的实现"
date:   2020-05-03 22:03:00
categories: tracing
tags: [java,zipkin,brave,b3]
icon: "https://zipkin.io/public/img/logo_png/zipkin_vertical_grey_gb.png"
---

> 对 http://www.iocoder.cn/categories/Zipkin/ 的一些补充，分析基于Brave#release-5.11.2分支，可能未来会有所变化

> 开头先打个广告，我们团队目前正在找人，坐标上海，感兴趣可以投递呀，嘻嘻。[高级Java开发工程师（框架开发）](https://www.lagou.com/jobs/7082374.html?source=pl&i=pl-3&show=e9f2b043557641efa104fa8dbb7139e4)

今天我们来讲讲Tracing系统中的时钟。目前市面上比较火的几款开源的链路追踪产品主要有

<!-- more -->

- Zipkin 由Twitter开源
- Jaeger 由Uber开源
- Skywalking 国人开发的链路追踪产品

那么在链路追踪中，需要在客户端记录Span的起始时间点和持续时间，在Zipkin中，在[`Span`](https://github.com/openzipkin/zipkin/blob/release-2.21.1/zipkin/src/main/java/zipkin2/Span.java)中可以找到如下代码，


```java
package zipkin2;

public final class Span implements Serializable { // for Spark and Flink jobs
<SNIP>
  final long timestamp, duration; // zero means null, saving 2 object references
<SNIP>
}
```

`timestamp`和`duration`分别记录Span的起始时间点和持续时间。类似得，在[`JaegerSpan`](https://github.com/jaegertracing/jaeger-client-java/blob/v1.2.0/jaeger-core/src/main/java/io/jaegertracing/internal/JaegerSpan.java)中有

```java
package io.jaegertracing.internal;

public class JaegerSpan implements Span {
...
  private final long startTimeMicroseconds;
  private final long startTimeNanoTicks;
  private long durationMicroseconds; // span durationMicroseconds
...
}
```

`startTime*`以及`durationMicroseconds`分别表示`Span`的起始时间点和持续时间，并且这里清楚地表明了记录的时间单位是微秒(microsecond)。在Skywalking中则为，[`AbstractTracingSpan`](https://github.com/apache/skywalking/blob/v7.0.0/apm-sniffer/apm-agent-core/src/main/java/org/apache/skywalking/apm/agent/core/context/trace/AbstractTracingSpan.java)。

```java
package org.apache.skywalking.apm.agent.core.context.trace;

public abstract class AbstractTracingSpan implements AbstractSpan {
    /**
     * The start time of this Span.
     */
    protected long startTime;
    /**
     * The end time of this Span.
     */
    protected long endTime;
}
```

其中的`startTime`以及`endTime`对应起始时间和结束时间，这里Skywalking用的并不是duration。

## Zipkin/Brave

在Zipkin的客户端实现中，Brave使用了一种比较特别的方式。还记得我们上次在讲`PendingSpans`得时候留下的坑吗?

```java
package brave.internal.recorder;

public final class PendingSpans extends ReferenceQueue<TraceContext> {
  public PendingSpan getOrCreate(TraceContext context, boolean start) {
    if (context == null) throw new NullPointerException("context == null");
    reportOrphanedSpans();
    PendingSpan result = delegate.get(context);
    if (result != null) return result;

    MutableSpan data = new MutableSpan();
    if (context.shared()) data.setShared();

    // 通常在创建一个新的Spand的时候，他的parentSpan应该会在执行状态
    // 那么Brave为了节约计算时间的额外损耗，这里会首先获取这个context的父级
    TickClock clock = getClockFromParent(context);
    // 如果无法获取到父级，一般可能是这是一个新的Span，或者是父级的Span已经被回收了
    if (clock == null) {
      clock = new TickClock(this.clock.currentTimeMicroseconds(), System.nanoTime());
      if (start) data.startTimestamp(clock.baseEpochMicros);
    } else if (start) {
      data.startTimestamp(clock.currentTimeMicroseconds());
    }
    PendingSpan newSpan = new PendingSpan(data, clock);
    PendingSpan previousSpan = delegate.putIfAbsent(new RealKey(context, this), newSpan);
    if (previousSpan != null) return previousSpan; // lost race

    if (trackOrphans) {
      newSpan.caller =
        new Throwable("Thread " + Thread.currentThread().getName() + " allocated span here");
    }
    return newSpan;
  }
}
```

这里的TickClock是很有讲究的，一般在JDK9以前，Java中是无法获取到微秒级别的绝对时间精度的。比如在JDK8中，通过[`System.nanoTime()`](https://docs.oracle.com/javase/8/docs/api/java/lang/System.html#nanoTime--)得到的时间只能用于计算相对时间，它的返回值并不能与任何真实时间挂钩。比如Oracle官方给出的案例，

```java
 long startTime = System.nanoTime();
 // ... the code being measured ...
 long estimatedTime = System.nanoTime() - startTime;
```

可以被用于计算相对时间，能够达到纳秒的精度。而这里Brave采用了一个非常巧妙的方式，从[`TickClock`](https://github.com/openzipkin/brave/blob/release-5.11.2/brave/src/main/java/brave/internal/recorder/TickClock.java)中可以看到，

```java
package brave.internal.recorder;

import brave.Clock;

final class TickClock implements Clock {
  final long baseEpochMicros;
  final long baseTickNanos;

  TickClock(long baseEpochMicros, long baseTickNanos) {
    // 基准绝对时间，单位us
    this.baseEpochMicros = baseEpochMicros;
    // 基准相对时间，单位ns
    this.baseTickNanos = baseTickNanos;
  }

  @Override public long currentTimeMicroseconds() {
    // 在计算当前时间的时候，会通过当前的nanoTime() - 基准相对时间，
    // 再加上 基准绝对时间 就可以计算得到当前的时间，其中流逝的时间精度为纳秒
    return ((System.nanoTime() - baseTickNanos) / 1000) + baseEpochMicros;
  }

  @Override public String toString() {
    return "TickClock{"
      + "baseEpochMicros=" + baseEpochMicros + ", "
      + "baseTickNanos=" + baseTickNanos
      + "}";
  }
}
```

由于这里流逝的时间精度为纳秒，可以很好的满足`Span`中`Duration`计时的时间精度。但这里`baseEpochMicros`的时间精度则是取决于JDK的版本。

我们首先看一下Brave中`Clock`这个接口，

```java
package brave;

// FunctionalInterface except Java language level 6
public interface Clock {
  // 是一个FunctionalInterface，只有一个方法
  long currentTimeMicroseconds();
}
```

`Brave`中把一些平台相关的功能都放到了[`Platform`](https://github.com/openzipkin/brave/blob/release-5.11.2/brave/src/main/java/brave/internal/Platform.java)这个类里面。

```java
package brave.internal;
public abstract class Platform {
...
  public Clock clock() {
    return new Clock() {
      // <= JDK8
      @Override public long currentTimeMicroseconds() {
        return System.currentTimeMillis() * 1000;
      }

      @Override public String toString() {
        return "System.currentTimeMillis()";
      }
    };
  }
  
    static class Jre9 extends Jre7 {
    @IgnoreJRERequirement @Override public Clock clock() {
      // JDK9+
      return new Clock() {
        // we could use jdk.internal.misc.VM to do this more efficiently, but it is internal
        @Override public long currentTimeMicroseconds() {
          java.time.Instant instant = java.time.Clock.systemUTC().instant();
          return (instant.getEpochSecond() * 1000000) + (instant.getNano() / 1000);
        }

        @Override public String toString() {
          return "Clock.systemUTC().instant()";
        }
      };
    }

    @Override public String toString() {
      return "Jre9{}";
    }
  }
}
```

- 默认JDK8及以下版本直接使用`System.currentTimeMillis() * 1000`，则精度为毫秒
- JDK9及以上版本使用`Instant`来计算得到微秒精度的时间。

> The range of an instant requires the storage of a number larger than a long. To achieve this, the class stores a long representing epoch-seconds and an int representing nanosecond-of-second, which will always be between 0 and 999,999,999. The epoch-seconds are measured from the standard Java epoch of 1970-01-01T00:00:00Z where instants after the epoch have positive values, and earlier instants have negative values. For both the epoch-second and nanosecond parts, a larger value is always later on the time-line than a smaller value.

根据官方文档，Instant使用的是`epoch-seconds`+`nanosecond-of-second`来表示当前时间，可以达到纳秒的精度。如此也就可以理解上述的`TickClock`了。

## Jaeger

我们在刚才看到`Jaeger`的代码，发现他有两个startTime的表示

- startTimeMicroseconds 当前时间的微秒数
- startTimeNanoTicks 当前时间的相对纳秒数
- durationMicroseconds 持续时间的微秒数

要理解上述的定义需要先看一下`Jaeger`中对`Clock`接口的定义，

```java
package io.jaegertracing.internal.clock;

/**
 * A small abstraction around system clock that aims to provide microsecond precision with the best
 * accuracy possible.
 */
public interface Clock {
  /**
   * Returns the current time in microseconds.
   *
   * @return the difference, measured in microseconds, between the current time and and the Epoch
   * (that is, midnight, January 1, 1970 UTC).
   */
  long currentTimeMicros();

  /**
   * Returns the current value of the running Java Virtual Machine's high-resolution time source, in
   * nanoseconds.
   *
   * <p>
   * This method can only be used to measure elapsed time and is not related to any other notion of
   * system or wall-clock time.
   *
   * @return the current value of the running Java Virtual Machine's high-resolution time source, in
   * nanoseconds
   */
  long currentNanoTicks();

  /**
   * @return true if the time returned by {@link #currentTimeMicros()} is accurate enough to
   * calculate span duration as (end-start). If this method returns false, the {@code JaegerTracer} will
   * use {@link #currentNanoTicks()} for calculating duration instead.
   */
  boolean isMicrosAccurate();
}
```

这里的文档写得很清楚，比较特别的一个接口方法是`boolean isMicrosAccurate()`

- 如果`currentTimeMicros()`返回的时间足够精确，则为`True`
- 如果类似JDK8的情况，那么就是`False`。Jaeger会转而使用`currentNanoTicks()`来计算相对时间。默认的[`SystemClock`](https://github.com/jaegertracing/jaeger-client-java/blob/v1.2.0/jaeger-core/src/main/java/io/jaegertracing/internal/clock/SystemClock.java)就是一个不精确的例子

在[`JaegerTracer`](https://github.com/jaegertracing/jaeger-client-java/blob/v1.2.0/jaeger-core/src/main/java/io/jaegertracing/internal/JaegerTracer.java#L456-L465)中可以看到具体对时间赋值的代码，


```java
package io.jaegertracing.internal;

public class JaegerTracer implements Tracer, Closeable {
...
  public class SpanBuilder implements Tracer.SpanBuilder {
    @Override
    public JaegerSpan start() {
...
      long startTimeNanoTicks = 0;
      boolean computeDurationViaNanoTicks = false;

      // 如果用户为特意指定开始时间
      if (startTimeMicroseconds == 0) {
        // 使用默认的currentTimeMicros
        startTimeMicroseconds = clock.currentTimeMicros();
        // 接着检查时钟是否足够精确
        if (!clock.isMicrosAccurate()) {
          // 如果不够精确，则记录当前的相对纳秒数
          startTimeNanoTicks = clock.currentNanoTicks();
          computeDurationViaNanoTicks = true;
        }
      }
      ...
    }
  }
}
```

在Span中记录了`startTimeNanoTicks`并设置`computeDurationViaNanoTicks`为True，则在[`JaegerSpan.finish()`](https://github.com/jaegertracing/jaeger-client-java/blob/v1.2.0/jaeger-core/src/main/java/io/jaegertracing/internal/JaegerSpan.java#L170-L178)的时候会使用NanoTicks来计算duration。

```java
package io.jaegertracing.internal;
public class JaegerSpan implements Span {
...
  @Override
  public void finish() {
    if (computeDurationViaNanoTicks) {
      long nanoDuration = tracer.clock().currentNanoTicks() - startTimeNanoTicks;
      finishWithDuration(nanoDuration / 1000);
    } else {
      finish(tracer.clock().currentTimeMicros());
    }
  }
...
}
```

这个代码应该足够简单了，不需要过多的解释。

## Skywalking

精度是毫秒，直接用的`System.currentTimeMillis()`，具体可以看代码[AbstractTracingSpan](https://github.com/apache/skywalking/blob/v7.0.0/apm-sniffer/apm-agent-core/src/main/java/org/apache/skywalking/apm/agent/core/context/trace/AbstractTracingSpan.java)。在与其他两者的比较中落了下乘。

## 总结

我们发现，老牌的Tracing系统Zipkin/Brave对客户端时间记录的抽象程度、时间精度和性能考量都十分到位。而Jaeger的抽象则稍有些繁琐，到时间精度的实现也能够达到微秒量级。但Skywalking则为对此做特殊优化。

从这方面考虑，Zipkin >= Jaeger >> Skywalking

