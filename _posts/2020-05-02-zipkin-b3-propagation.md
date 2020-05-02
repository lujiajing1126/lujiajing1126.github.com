---
layout: post
title:  "分析Zipkin/Brave中的B3-Propagation的设计和实现"
date:   2020-05-02 20:40:00
categories: tracing
tags: [java,zipkin,brave,b3]
icon: "https://zipkin.io/public/img/logo_png/zipkin_vertical_grey_gb.png"
---

> 对 http://www.iocoder.cn/categories/Zipkin/ 的一些补充，分析基于Brave#release-5.11.2分支，可能未来会有所变化

> 开头先打个广告，我们团队目前正在找人，坐标上海，感兴趣可以投递呀，嘻嘻。[高级Java开发工程师（框架开发）](https://www.lagou.com/jobs/7082374.html?source=pl&i=pl-3&show=e9f2b043557641efa104fa8dbb7139e4)

协议的细节可以在如下地址找到

> https://github.com/openzipkin/b3-propagation

<!-- more -->

## Trace采样的四种状态

B3协议将Trace的状态(Sampling State)分为四种:

- Defer: 目前未知，需要后续确定
- Deny: 拒绝采样
- Accept: 已接受采样
- Debug: 强制接受采样，并设置Span.Tag{debug=True}

为了实现以上几种状态，在Brave里面使用了几个不同的bit位来标记不同的状态

## Flags

> 所有Flag的定义可以在InternalPropagation这个暴露API的类中找到，https://github.com/openzipkin/brave/blob/release-5.11.2/brave/src/main/java/brave/internal/InternalPropagation.java#L34-L39

- FLAG_SAMPLED = 1 << 1 用于标记是否进行采样
- FLAG_SAMPLED_SET = 1 << 2 用于标记是否已经进行采样决定
- FLAG_DEBUG = 1 << 3 用于标记是否属于DEBUG类型

我们用一个Tuple如`(i,j,k)`来表示这三个值的不同组合，从左到右分别是`Flag_Sampled_Set`，`Flag_Sampled`以及`Flag_Debug`，则相应的状态表为

- (1, 1, 1) => Debug
- (1, 1, 0) => Accept
- (1, 0, 0) => Deny
- (0, 0, 0) => Defer aka Empty

其余的状态理论上都是不合法的状态，比如

- (0, 1, 0) => 第一个bit表示未标记采样，但第二个bit表示接受采样，这是互相矛盾的
- (1, 0, 1) => 第三个bit表示Debug状态，但第二个bit和第一个bit联合表示拒绝采样，也是矛盾的

```java
package brave.internal;

public abstract class InternalPropagation {
  <SNIP>
  public static int sampled(boolean sampled, int flags) {
    // 如果sampled为True表示接受采样，会同时设置FLAG_SAMPLED以及FLAG_SAMPLED_SET为1，用位或运算
    if (sampled) {
      flags |= FLAG_SAMPLED | FLAG_SAMPLED_SET;
    } else {
    // 如果拒绝采样，会同时设置FLAG_SAMPLED=0以及FLAG_SAMPLED_SET=1
      flags |= FLAG_SAMPLED_SET;
      flags &= ~FLAG_SAMPLED;
    }
    return flags;
  }
  <SNIP>
}
```

以及所有合法的组合定义在`SamplingFlags`类中，这个类是`TraceContext`的基类，用于抽象表示`TraceContext`的采样状态。以下几个`SamplingFlags`对应于协议中标明的四个不同的状态，除此以外其他的组合理论上是不合法的。

```java
package brave.propagation;

<SNIP>

import static brave.internal.InternalPropagation.FLAG_DEBUG;
import static brave.internal.InternalPropagation.FLAG_SAMPLED;
import static brave.internal.InternalPropagation.FLAG_SAMPLED_LOCAL;
import static brave.internal.InternalPropagation.FLAG_SAMPLED_SET;

//@Immutable
public class SamplingFlags {
  public static final SamplingFlags EMPTY = new SamplingFlags(0);
  public static final SamplingFlags NOT_SAMPLED = new SamplingFlags(FLAG_SAMPLED_SET);
  public static final SamplingFlags SAMPLED = new SamplingFlags(NOT_SAMPLED.flags | FLAG_SAMPLED);
  public static final SamplingFlags DEBUG = new SamplingFlags(SAMPLED.flags | FLAG_DEBUG);
  <SNIP>
}
```

## Extract B3 Propagation Header

接下来分析`B3Codec`是如何从HTTP Header中提取这些信息的，Brave中有两个类负责从HTTP的头部获取Trace的上下文信息

1. `B3Propagation<K>.B3Injector/B3Extractor`
2. `B3SingleFormat`

从注释看，`B3SingleFormat`对应的是[Single Header](https://github.com/openzipkin/b3-propagation#single-header)情况，如

```
b3: {x-b3-traceid}-{x-b3-spanid}-{if x-b3-flags 'd' else x-b3-sampled}-{x-b3-parentspanid}
```

而`B3Propagation<K>`则负责解析[Multiple Headers](https://github.com/openzipkin/b3-propagation#multiple-headers)形式，由四个不同的Header组成的信息：

```
X-B3-TraceId
X-B3-ParentSpanId
X-B3-SpanId
X-B3-Sampled
```

解析的过程定义在`extract`方法中，

```java
static final class B3Extractor<C, K> implements TraceContext.Extractor<C> {
    @Override public TraceContextOrSamplingFlags extract(C carrier) {
      if (carrier == null) throw new NullPointerException("carrier == null");

      // 首先尝试Single Header
      String b3 = getter.get(carrier, propagation.b3Key);
      TraceContextOrSamplingFlags extracted = b3 != null ? parseB3SingleFormat(b3) : null;
      if (extracted != null) return extracted;

      // 检查`X-B3-Sampled`字段，为了兼容性同时判断数字0/1和布尔值true/false
      String sampled = getter.get(carrier, propagation.sampledKey);
      // 这里使用Boolean类型是为了标记三种采样状态
      // - null: Defer
      // - True: Accept
      // - False: Deny
      Boolean sampledV;
      if (sampled == null) {
        sampledV = null; // defer decision
      } else if (sampled.length() == 1) { // handle fast valid paths
        char sampledC = sampled.charAt(0);

        if (sampledC == '1') {
          sampledV = true;
        } else if (sampledC == '0') {
          sampledV = false;
        } else {
          Platform.get().log(SAMPLED_MALFORMED, sampled, null);
          return TraceContextOrSamplingFlags.EMPTY; // trace context is malformed so return empty
        }
      } else if (sampled.equalsIgnoreCase("true")) { // old clients
        sampledV = true;
      } else if (sampled.equalsIgnoreCase("false")) { // old clients
        sampledV = false;
      } else {
        Platform.get().log(SAMPLED_MALFORMED, sampled, null);
        return TraceContextOrSamplingFlags.EMPTY; // Restart trace instead of propagating false
      }

      // 检查`X-B3-Flags: 1`，是否是Debug状态
      boolean debug = "1".equals(getter.get(carrier, propagation.debugKey));

      String traceIdString = getter.get(carrier, propagation.traceIdKey);
      // 允许出现TraceID不存在的情况，此时创建一个仅包含Sampled和Debug状态的SamplingFlags
      if (traceIdString == null) return TraceContextOrSamplingFlags.create(sampledV, debug);

      // Try to parse the trace IDs into the context
      TraceContext.Builder result = TraceContext.newBuilder();
      if (result.parseTraceId(traceIdString, propagation.traceIdKey)
        && result.parseSpanId(getter, carrier, propagation.spanIdKey)
        && result.parseParentId(getter, carrier, propagation.parentSpanIdKey)) {
        if (sampledV != null) result.sampled(sampledV.booleanValue());
        if (debug) result.debug(true);
        // 试图创建一个完整的TraceContext
        return TraceContextOrSamplingFlags.create(result.build());
      }
      return TraceContextOrSamplingFlags.EMPTY; // trace context is malformed so return empty
    }
  }
<SNIP>
}
```

然而这边通过`B3Extractor`得到的`TraceContext`并不是一个真正可用的实例，而是类似C语言中的一种`union`类型，它封装了三个可能的结果，

- TraceContext: 对应完整的上下文信息, type=1
- TraceIdContext: 仅包含TraceID, type=2
- SamplingFlags: 仅包含flags, type=3

我们根据`TraceIdContext`的注释可以知道，`TraceIdContext`对应的是`SpanID`是由外部系统控制的情况，比如[`Amazon X-Ray`](https://github.com/openzipkin/zipkin-aws)

## Create next span with `TraceContextOrSamplingFlags`

接着我们可以根据这个`union`类型`TraceContextOrSamplingFlags`来创建`Span`，代码在`Tracer`里面，

```java
package brave;

public class Tracer {
<SNIP>
  public Span nextSpan(TraceContextOrSamplingFlags extracted) {
    if (extracted == null) throw new NullPointerException("extracted == null");
    // 先判断是不是完整的TraceContext
    TraceContext context = extracted.context();
    if (context != null) return newChild(context);

    // 再判断是不是TraceIdContext
    TraceIdContext traceIdContext = extracted.traceIdContext();
    if (traceIdContext != null) {
      return _toSpan(decorateContext(
        InternalPropagation.instance.flags(extracted.traceIdContext()),
        traceIdContext.traceIdHigh(),
        traceIdContext.traceId(),
        0L,
        0L,
        0L,
        extracted.extra()
      ));
    }

    // 如果以上都不是，那么一定是SamplingFlags
    SamplingFlags samplingFlags = extracted.samplingFlags();
    List<Object> extra = extracted.extra();

    // 这里需要判断当前环境是否存在已知的TraceContext，将其认作隐式的父Span
    TraceContext implicitParent = currentTraceContext.get();
    int flags;
    long traceIdHigh = 0L, traceId = 0L, localRootId = 0L, spanId = 0L;
    if (implicitParent != null) {
      // 如果存在TraceContext上下文，直接使用implicitParent作为ParentSpan
      flags = InternalPropagation.instance.flags(implicitParent);
      traceIdHigh = implicitParent.traceIdHigh();
      traceId = implicitParent.traceId();
      localRootId = implicitParent.localRootId();
      spanId = implicitParent.spanId();
      // 这里需要做的仅仅是把extra包合并在一起
      extra = concatImmutableLists(extra, implicitParent.extra());
    } else {
      // 否则的话，遵照SamplingFlags中指定的flags
      flags = InternalPropagation.instance.flags(samplingFlags);
    }
    // 创建一个新的Span
    // 如果这里的TraceID和SpanID都为空，会在decorateContext方法中对其进行补全
    return _toSpan(decorateContext(flags, traceIdHigh, traceId, localRootId, spanId, 0L, extra));
  }

<SNIP>
}
```

至此的话，我们就了解了Brave客户端是如何进行B3协议的解析，以及如何正确地映射相应的状态。这里再举个例子，比如，B3协议中提到的如下请求：

```
                                Server Tracer     
                              ┌───────────────────────┐
 Health check request         │                       │
┌───────────────────┐         │   TraceContext        │
│ GET /health       │ Extract │ ┌───────────────────┐ │
│ X-B3-Sampled: 0   ├─────────┼>│ NoOp              │ │
└───────────────────┘         │ └───────────────────┘ │
                              └───────────────────────┘
```

如果使用`curl`这样的工具，只传递一个`X-B3-Sampled: 0`，那么`Extractor`就会创建一个`SamplingFlags`，并且设置成(1, 0, 0)的状态，表明这个请求已经作出了采样决定，并且拒绝采样（Deny）。

分析B3协议及其实现的目的在于理解链路追踪系统的实现，在横向对比市面上不同的Tracing产品的时候能够有的放矢，比如目前比较火的几款开源的系统，比如

- Jaeger
- Skywalking
- Zipkin

他们具有什么样的特征以及实现的区别。更加深入的考察能够帮助我们更好的做架构的选型，以后还会给大家解读更多链路追踪系统的设计和实现。
