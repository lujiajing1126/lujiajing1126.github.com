---
layout: post
title:  "React & Redux Tutorial Series (2): Introduction to Webpack and React basic"
date:   2016-04-07 11:27:00
categories: frontend
tags: [react,redux,es6]
icon: "http://en.gravatar.com/userimage/53661496/41e63450976c696dfd89c047c5148212.jpg?size=200"
---

Author: [小灰灰](http://www.coder.dog/)

Last Update: 7th Apr, 2016

> 本系列将介绍如果完成一个react + redux的应用，本篇将介绍webpack以及react基础

## Webpack

什么是`webpack`?

<!-- more -->
```
// webpack is a module bundler
// This means webpack takes modules with dependencies
//   and emits static assets representing those modules.
---- from http://webpack.github.io/
```

在项目中，`webpack`负责编译`js`,`css`或者其他precompile-css语言,例如`less`,`sass`,通过不同的插件，你也可以配合`babel`转换`es6`,`coffee`,`jsx`等语言到浏览器可用的`es5`.

### Loaders

`Loaders`在`webpack`中起到重要的作用,他是一系列的应用到程序中各类资源文件上的转换器，例如你能够通过`webapck`的配置以及参数设置、定义，告诉`webpack`如何加载`CoffeeScript`和`jsx`.

两个重要的配置，如`preLoaders`和`loaders`:

{% highlight javascript %}
{
	preLoaders: [
      {
        test: /\.(js|jsx)$/,
        include: srcPath,
        loader: 'eslint-loader!macro-loader?config=' + path.join(__dirname,'macros.json')
      }
    ],
    loaders: [
    	{
    		{
        test: /\.sass/,
        loader: ExtractTextPlugin.extract('style-loader','css-loader!sass-loader?outputStyle=expanded&indentedSyntax')
      },
      {
        test: /\.scss/,
        loader: ExtractTextPlugin.extract('style-loader','css-loader!sass-loader?outputStyle=expanded')
      },
    	}
    ]
}
{% endhighlight %}

`preLoaders`主要可以进行语法校验，以及其他自定义的预处理

`loaders`主要是进行资源编译转换.

### Plugins

通过插件机制，`webpack`可以在不同的生命周期做更多的自定义行为.举几个例子:

  - `HotModuleReplacementPlugin`热加载
  - `DefinePlugin`注射环境变量到程序中，用于在不同的环境执行不同的逻辑
  - `ExtractTextPlugin`用于分离样式文件

  在实际开发中，往往需要根据开发环境，来决定程序中的行为，如在开发环境中模拟数据(mock)，开启Debug信息等，在生产环境，使用`ajax`都可以通过注入环境变量来实现。
  
{% highlight javascript %}
// cfg/dev.js
{
	plugins: [
  		new webpack.DefinePlugin({
  			'process.env.NODE_ENV': "'development'",
  			'process.env.MOCK_DATA': process.env.PREFER_MOCK_DATA
  		});
  	]
}
// api.js
// 在dev环境使用json mock数据，在其他环境使用api请求形式
if(process.env.NODE_ENV === 'development' && process.env.MOCK_DATA) {
	setTimeout(() => callback(_products),timeout || TIMEOUT)
} else {
	fetch(`${API_BASEPATH}/question?limit=${QUESTIONS_LIMIT}`)
}
{% endhighlight %}

### HMR

> "Hot Module Replacement" (HMR) is a feature to inject updated modules into the active runtime.

代码示例如下，我们在部分代码文件上开启热加载:

{% highlight javascript %}
if (module.hot) {
  // Enable Webpack hot module replacement for reducers
  module.hot.accept('../reducers', () => {
    const nextReducer = require('../reducers')
    store.replaceReducer(nextReducer)
  });
}
{% endhighlight %}

### Dev server
{% highlight javascript %}
/*eslint no-console:0 */
'use strict';
require('core-js/fn/object/assign');
const webpack = require('webpack');
const WebpackDevServer = require('webpack-dev-server');
const config = require('./webpack.config');
const open = require('open');
new WebpackDevServer(webpack(config), config.devServer)
.listen(config.port, 'localhost', (err) => {
  if (err) {
    console.log(err);
  }
  console.log('Listening at localhost:' + config.port);
  console.log('Opening your system browser...');
  open('http://localhost:' + config.port + '/webpack-dev-server/');
});
{% endhighlight %}

`webpack`提供了微型的开发服务器，但是功能也十分强大，包括热替换的实现，自动刷新，基于配置的反向代理等

#### Proxy

> Webpack dev server 利用 `node-http-proxy` 提供可配置的代理功能，将请求转发到外部的后端服务器

一个包含反向代理功能的实际的例子如下：

{% highlight javascript %}
devServer: {
    contentBase: './src/',
    historyApiFallback: true,
    hot: true,
    port: defaultSettings.port,
    publicPath: defaultSettings.publicPath,
    noInfo: false,
    proxy: {
      '/api/*': {
        target: 'http://localhost:8080/chosen-api',
        secure: 'false'
      }
    }
}
{% endhighlight %}

其他的进阶使用，请仔细查阅文档.


## React

### Component 组件

组件的核心思想就是定义并且重用你的`View`，所有的`Component`都继承自`React`的`BaseComponent`，如

{% highlight javascript %}
import React, { Component, PropTypes } from 'react'
import { render } from 'react-dom'
class SimpleComponent extends Component {
	render() {
		<div>HelloWorld</div>
	}
}
// 讲Component插入到指定DOM节点
render(
  <SimpleComponent />
  document.getElementById('example')
);
{% endhighlight %}

其中`render`方法是核心要素，负责渲染（注：要注意的是`render`并不会真正在浏览器中插入DOM元素，而是在内存中渲染一个虚拟的DOM，再通过update插入到浏览器界面中)

### `props`属性和`state`状态

每个`Component`组件有`props`属性和`state`状态

从下面的例子可以看到，`props`属性是从外部或其他组件传入的。（注：仅仅从`react`的角度来看，属性一般是不变的，或者推荐如此，如果不理解，就跳过这句话）

{% highlight javascript %}
import React, { Component, PropTypes } from 'react'
class SimpleComponent extends Component {
	render() {
		return <div>this.props.content</div>
	}
}
class SimpleContainer extends Component {
	render() {
		const content = "helloworld from props";
		return (
		  <div>
			 <SimpleComponent content={content} />
		  </div>
		);
	}
}
{% endhighlight %}

而在`react`中，`state`是经常变化的属性，一般是由`Component`自行维护，`getInitialState`是一个生命周期提供的方法，可以提供`state`的初始值.通过点击事件绑定，改变`state`，会触发`react`重新执行渲染动作.

值得重点关注的是，`state`并不是直接通过改变key,value来进行update的，而是通过setState方法进行更新，这是因为state是一个不可变对象(immutable object)，在许多现代编程语言中，都提供了Immutable对象，比如`scala`,`swift`等

在这里引入Immutable对象的好处是，使得程序的开发变得更加简单，程序员不用担心由于自身失误而导致错误的修改程序的状态，任何对状态的改变通过api进行，也可以有利于程序架构的改进，比如进行`AOP`等等。不可变对象的更新不会在原有对象是进行改变，而总是会创建一个新的对象，你也许会对性能提出质疑，所以`facebook`提供的`immutablejs`通过`structural sharing`来解决性能问题

引用`facebook`对`immutablejs`的介绍：

> Immutable data cannot be changed once created, leading to much simpler application development, no defensive copying, and enabling advanced memoization and change detection techniques with simple logic. Persistent data presents a mutative API which does not update the data in-place, but instead always yields new updated data.

{% highlight javascript %}
import React, { Component, PropTypes } from 'react'
class SimpleComponent extends Component {
  getInitialState() {
    return {liked: false};
  }
  handleClick() {
    this.setState({liked: !this.state.liked});
  }
  render() {
    var text = this.state.liked ? 'like' : 'haven\'t liked';
    return (
      <p onClick={this.handleClick}>
        You {text} this. Click to toggle.
      </p>
    );
  }
}
{% endhighlight %}

#### propTypes "强类型"

> 使用`propTypes`能够让`react`在运行时帮助你检查代码，也有利于让其他开发者读懂你的组件

{% highlight javascript %}
QuestionItem.propTypes = {
	question: PropTypes.shape({
		id: PropTypes.number.isRequired,
		content: PropTypes.string.isRequired,
		choices: PropTypes.array.isRequired
	}).isRequired,
	answer: PropTypes.number.isRequired,
	makeChoice: PropTypes.func.isRequired
}
{% endhighlight %}

### Lifecycle 组件的生命周期

除了之前提到的`getInitialState`辅助方法以外，`react`的`component`还为开发者提供更为精确的组件生命周期控制

  - Mouting: `componentWillMount`
  - Mouting: `componentDidMount`
  - Updating: `componentWillReceiveProps`
  - Updating: `shouldComponentUpdate`
  - Updating: `componentWillUpdate`
  - Updating: `componentDidUpdate`
  - Unmounting: `componentWillUnmount`

 如果你从事过`iOS`或者`Android`开发，是不是发现和其他平台提供的`Controller`/`Activity/Fragment`的生命周期相仿
 
 举个例子，在初次渲染完成后为代码块添加高亮:
 
{% highlight jsx %}
import React, { Component, PropTypes } from 'react'
class QuestionItem extends Component {
  highlightCodeBlocks() {
   if(this.props.question.content.indexOf('```') === -1) {
     return
    }
    var els = findDOMNode(this.refs.QuestionContent).querySelectorAll('pre code')
    for (var i = 0; i < els.length; i++) {
      hljs.highlightBlock(els[i])
     }
	}
  componentDidMount() {
    this.highlightCodeBlocks();
  }
  render() {
    return <ReactMarkdown ref="QuestionContent" source={question.content} />
  }
}
{% endhighlight %}

这里的`ref`是为`DOM`添加一个引用，方便在组件中通过`ref`或者`findDOMNode`得到该`DOM`

更多的细节与请参阅文档和社区


