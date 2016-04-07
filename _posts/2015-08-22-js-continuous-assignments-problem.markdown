---
layout: post
title:  "Javascript 连续赋值的问题深究"
date:   2015-08-22 13:36:45
categories: javascript
tags: [js,language]
icon: "//en.gravatar.com/userimage/53661496/41e63450976c696dfd89c047c5148212.jpg?size=200"
---

> 在[牛客_帮打个广告](http://www.nowcoder.com)的前端群里碰到的一个js的问题，网上查了一下并没有令人信服的解释，遂深究一下

## 问题

{% highlight javascript %}
var a = {n: 1}
var b = a;
a.x = a = {n: 2}
console.log(a.x);
console.log(b.x);
{% endhighlight %}

这个代码最后的结果是啥？

<!-- more -->

执行以下，结果为

```
a.x = undefined
b.x = {n :2}
```

## 简化问题

这个问题在 [SegmentFault](http://segmentfault.com/q/1010000002637728) 里面有解释

问题最重要的是 a.x = a = {n:2}到底干了什么，以及很多人纠结他的执行顺序

我们把问题简化为，搞清楚这段代码的行为

```
var a = {n: 1}
a.x = a = {n: 2}
```

## 工具

我们使用已经有的工具:

  - [JavaScript可视化AST生成器](http://jointjs.com/demos/javascript-ast)
  - [JavaScript解释器](https://neil.fraser.name/software/JS-Interpreter/index.html)

## 执行顺序

先在AST生成器中生成以上代码的抽象语法树

![AST](/img/ast.png)

执行顺序简单来说是按AST后序遍历

## 关键语句分析

```
a.x = a = {n: 2}
```

### `a.x`

先执行`a.x`，从scope(上下文)中取出`a`对象

[Function: Interpreter.prototype.getValueFromScope](https://github.com/NeilFraser/JS-Interpreter/blob/master/interpreter.js#L1481)

并且创建一个名为`x`的原生对象

[Function: Interpreter.prototype.createPrimitive](https://github.com/NeilFraser/JS-Interpreter/blob/master/interpreter.js#L1182)

**但这一步并不是把`x`作为key绑定到`a`对象上，而是暂且把它放到执行堆栈上：**

{% highlight javascript %}
// https://github.com/NeilFraser/JS-Interpreter/blob/master/interpreter.js#L2146
this.stateStack[0].value = [state.object, state.value];
{% endhighlight %}

以上object即`a`，value即`x`

### `a = {n:2}`

根据后序遍历的原则，我们从AST上可以清楚的看到，a = {n:2}是先执行的

那么就改变了scope上`a`的值，也即是改变了a的指针

那么这时候`a.x`中的a仍然是`{n:1}`，并且已经脱离了scope，没有其他的变量持有旧的`a`的引用，即从程序中无法访问到该对象

那么下次触发GC的时候，这个对象由于没有被引用到，就会被回收，这是后话

### `a.x = {n:2}`

最后执行的是`a.x = {n:2}`的赋值操作

由于`a`是`{n:1}`，无法访问到，这步操作会执行，但是并不会到scope上的`a`(指向`{n:1}`)产生任何影响

解释器在这时候才会真正将`x`作为Key绑定到a对象上，然后赋值{n:2}

具体代码跟踪：

[Function: Interpreter.prototype.setValue](https://github.com/NeilFraser/JS-Interpreter/blob/master/interpreter.js#1569)

由于之前提到的`this.stateStack[0].value = [state.object, state.value]`，所以`left`是一个数组

进入到第一个`if`逻辑中

```
this.setProperty(obj, prop, value);
```

[Function: Interpreter.prototype.setProperty](https://github.com/NeilFraser/JS-Interpreter/blob/master/interpreter.js#1383)

其中obj就是旧的`a`,`prop`是`x`,`value`是{n:2}

最后在1421行`obj.properties[name] = value;`完成赋值操作

但是因为这个`a`对象已经没法访问到，所以并没有什么乱用

## 显然

如果加一句
```
var b = a;
```

那么`a.x`赋值完成后，由于`b`持有旧的`a`的引用，那么自然能够通过`b`访问到之前的`a`

即
```
b = {n:1,x:{n:2}}
```

可以看下面简化的关于引用的例子：

```
var a = {n:1};
var b = a;
a = {n:2}
// b仍然指向之前a的对象{n:1}，即持有旧的`a`的指针
```

假设我们做如下改变:

```
a = a.x = {n: 2};
```

这样的话，按之前的推断

先执行`a.x = {n:2}`，再执行`a = {n:2}`

显然结果也是相同的

## 结论

在这个语句的分析中，重点是

语句的执行顺序：按AST后序遍历

`a.x`不直接赋值，而是只创建`x`原生对象，最后才赋值

所有可以访问到的对象是与执行的上下文绑定的，即`scope`

访问不到不代表没有执行

其他的进一步的研究大家可以再debug一下解释器~

仅供参考
