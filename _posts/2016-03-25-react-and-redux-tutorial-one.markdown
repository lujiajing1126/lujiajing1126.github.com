---
layout: post
title:  "React & Redux Tutorial Series (1): Contruct Scaffold and ES6 Basic"
date:   2016-03-25 16:00:00
categories: frontend
tags: [react,redux,es6]
icon: "//en.gravatar.com/userimage/53661496/41e63450976c696dfd89c047c5148212.jpg?size=200"
---

> 本系列将介绍如果完成一个react + redux的应用，本篇将介绍如何构建一个react，redux项目，以及其他必备的基础知识

## React Overview

facebook 发布了革命性的`react`框架，作为对前端`MV*` 开发模式的反思，`react`为前端提供了组件式的开发方式，基于`Virtual DOM`的架构，相比于`angular`的`dirty watch`大大增加的性能，利用优化的`diff`算法，可以接近[O(n)](http://facebook.github.io/react/docs/reconciliation.html)的效率

<!-- more -->

Features: 

 - `JSX`
 - `Virtual DOM`
 - `Data Flow`

对于典型的前端开发者，刚上手`react`的时候是略微痛苦的，`react`接管了所有的DOM操作，使得我们无法利用`jQuery`来操作DOM，这对于我们来说是一种思维模式的改变

我们将在使用`redux`的时候再介绍它

## Environment Setup

安装`react`，我们推荐使用`nvm`来安装`nodejs`

{% highlight shell %}
$ curl -o- https://raw.githubusercontent.com/creationix/nvm/v0.31.0/install.sh | bash
# 安装最新版本
$ nvm ls-remote
# 安装node 5.9.0
$ nvm install v5.9.0
# 设置node为默认值
$ nvm alias default node
$ npm -v 
3.7.x
$ node -v
5.9.x
{% endhighlight %}

我们需要一些准备工作，开发者应该对一下工具有一定的了解

  - [`webpack`](http://webpack.github.io/): 用于编译，打包等
  - [`yeoman`](http://yeoman.io/): 用于生成项目脚手架

并且对`ES6`语法有一定了解，不了解的可以参考

  - [es6](https://github.com/bevacqua/es6)
  - [es6-features](https://github.com/lukehoban/es6features)

## Install

我们选择`react-webpack-redux`这个生成器来生成代码

{% highlight shell %}
$ npm install -g webpack
$ npm install -g yo
$ npm install -g generator-react-webpack-redux

# 新建一个目录，并进入目录
mkdir my-new-project && cd my-new-project

# 启动生成器
yo react-webpack-redux
# 你需要选择你选用的技术栈
{% endhighlight %}

安装完成之后，主要目录结构如下，省略一些次要的

```
- my-new-project
  - src: 
    index.html 首页
    index.js 程序入口
    - components: react组件
    - reducers: reducer处理器
    - actions: actions动作
    - stores: stores存储容器
    - containers: redux组件容器
  - cfg: webpack配置
  server.js
  webpack.config.js
```

之后运行`npm start`,就能看到一个开始页，我们的准备工作也就完成了

## Appendix

在这里有必要提前介绍一些有关的JS基础，以后的篇幅中如果没有特殊情况，将不再做语法上的介绍

### 模块化

模块的导入,有以下几种导入方式:

{% highlight javascript %}
// 如果模块使用 module.exports = xxx 的形式，可以用第一种
import React from 'react'
// 如果模块导出的是命名的方式，可以用第二种
import { MAKE_CHOICE,CLEAR_ANS } from '../constants/ActionTypes'
// 如果模块有默认导出，可以使用 { default as xxx }的形式
import {default as Api,ERR_ANS,ERR_TK} from '../api/question'
{% endhighlight %}


模块的导出

{% highlight javascript %}
// 直接导出命名函数，也可以是class，variable等
export function clearAns() {
	return {
		type: types.CLEAR_ANS
	}
}
// 默认模块导出
export default {
	getRandomQuestions(callback,timeout) {
		// code here
	}
}
{% endhighlight %}


### 面向对象

在`react`里面组件都是通过继承`Component`来实现

{% highlight javascript %}
// 以前的写法
var HelloMessage = React.createClass({
  render: function() {
    return <div>Hello {this.props.name}</div>;
  }
});
// 在ES6中，现在这么写
import { Component } from 'react'
class HelloMessage extends Component {
	render() {
		return <div>Hello {this.props.name}</div>;
	}
}
{% endhighlight %}

### Arrow Functions and Assignment Destructuring 箭头函数和解构赋值

箭头函数`=>`在`CoffeeScript`中也有，用于将外部作用域的`this`导入闭包

{% highlight javascript %}
this.name = "name";
// 以前的写法
callSomeFunction("arg1",(function(_this){
	return function(arg) {
		// 通过注入的变量访问外部的this
		return _this.name + "arg";
	};
})(this));
// ES6
callSomeFunction("arg1",(arg) =>
		_this.name + "arg"; // implicit return when no brace around
);
{% endhighlight %}

在`react`中往往这样用:

{% highlight jsx %}
// 快速将boundActionCreators对象的每个key,value对赋值给<QuestionItem>组件的属性值
{questions.map(question => {
	let answer = answers[question.id] != undefined ? answers[question.id] : NO_ANS
	return <QuesionItem key={question.id} question={question} answer={answer} {...boundActionCreators} />
})}
{% endhighlight %}

### 常用函数

`Object.prototype.assign`: 常用与合并多个对象
	
{% highlight javascript %}
// 先忽略Map..会把第三个参数覆盖到第二个参数上，然后合并到第一个参数
Object.assign({},state,Map([[action.question_id,action.answer_id]]).toObject())
// 记得assign是浅合并,即第二层以后的元素不会判断合并，之后取最新的值
// 我们期望得到{a:{b:1,c:3}}，然而结果是{a: {c: 3}
// 我们可以用 KyleAMathews/deepmerge 这个库来做
Object.assign({a: {b: 0}}, {a: {b: 1, c: 2}}, {a: {c: 3}});
{% endhighlight %}

`Function.prototype.bind`: 绑定函数内部`this`以及指定参数

在`react`中常用于指定回调函数的参数

{% highlight jsx %}
// 技巧：在render的时候指定回调函数的参数，在使用map的时候特别有用
<input onChange={this.props.makeChoice.bind(this,this.props.qid,this.props.aid)} />
{% endhighlight %}

### 其他

`let`关键字：创建块作用域的变量

{% highlight javascript %}
if (true) {
	let tmp = "a";
	console.log(tmp); // "a"
}
console.log(tmp); // undefined
{% endhighlight %}

`const`关键字：定义常量


