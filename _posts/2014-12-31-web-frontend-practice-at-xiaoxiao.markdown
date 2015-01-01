---
layout: post
title:  "年终总结 之 校校前端实践"
date:   2014-12-31 23:59:59
categories: web
tags: [web,front-end]
icon: "/img/manyilogo.jpg"
---

> 本文主要分享，2014年7月至9月，我在[校校](http://xiaoxiao.la)任职期间，在前端技术上的实践

## Infrastructure

这次项目拉了@Sherwood，商量下来，整个系统采用前后端解耦的架构，一开始自然而然就想到用```SPA```的解决方案，这样能够提升整个网站的响应速度，降低服务器的负载，做代码更新，CDN都很方便

SPA的解决方案有很多，包括Google的```Angular```,但我个人不喜欢他的模板体系，很难嵌套，至于```Ember```，太重、学习成本很高，当时还不是很了解```Spine```，风车有用它，不过最近用下来感觉非常不好

由于只招到一个前端工程师@picker，而且也是刚转到前端的，项目鸭梨很大，所以最后就决定自己造轮子

但是基础设施不可能自己造，所以这边基础设施的选择就尤为重要：

<!-- more -->

  1. 构建工具套件

	2013年的时候就出现了流行前端的构建流程```Yeoman```+```Bower```+```Grunt```，在这次重建整个项目的时候，放弃了之前的所有代码，重新构建了项目

  2. 模块化标准

	当时主流的模块化标准有```AMD```，主要是```RequireJS```实现，```CMD```标准，和```CommonJS```，主要是```SeaJS```实现

	由于之前的项目使用过SeaJS，对于他的构建方法和整个体系比较了解，能够适用于大中型的前端项目，所以也没啥好说的就选了SeaJS

  3. 核心类库/UI框架

	这个方面，其实也没啥好说的，考虑到可维护性，选了```jQuery```，考虑到低版本浏览器的兼容性，我们选用了```1.11.x```的```stable```版本

	由于选用的版本没有特别针对```drag```,```drop```事件做兼容，我们自己做了hack

{% highlight javascript %}
!function(){var deps=["jquery"];define("sui/core/common",deps,function(a){
	SUI.$=a("jquery");
	/**
	 * Hack jQuery to support dataTransfer
	 * contributed by: jquery.ndd
	 */
	var originalFix = SUI.$.event.fix;
	SUI.$.event.fix = function(event) {
    	event = originalFix.apply(this, [event]);
	    if( event.type.indexOf('drag') == 0 || event.type.indexOf('drop') == 0 ) {
	        event.dataTransfer = event.originalEvent.dataTransfer;
	    }
	    return event;
	}
})}();
{% endhighlight %}

UI框架方面也是使用了顺手的```Bootstrap```，和```jQuery```能够配合使用

## Framework

实践的核心是框架:


### **模块化/分层**

前端采用模块化+MVC的好处是，当前端的逻辑变得复杂时，可以重用大部分模块，针对每个页面写特有的逻辑就可以了，这样页面再多也能轻松维护

分层主要有几部分，```application.js```是App的核心，也就是```main loop```，控制器，模型层，服务层，公共模块等

当页面加载完

{% highlight html %}
<script src="sui/seed.js"></script>
<script>
    SUI.use('scripts/application');
</script>
{% endhighlight %}

application模块会加载所有页面的模板，控制器，依赖注入系统，路由组件，注册全局事件监听器，初始化用户模型等，根据当前的url确定加载的首个页面

### **路由组件**

路由组件主要由一个```json```数组定义

{% highlight json %}
"activity/vote/:voteId": {
	regExp: "activity\\/vote\\/([0-9]+)",
	controller: "activity/votedMembersController",
	template: "activity/votedMembers"
}
{% endhighlight %}

包括目标路由的url形式，对应控制器以及模板，当然部分路由可以匹配到默认规则就是用默认，如果url部分包含动态内容，如```:voteId```，需要额外定义一个正则匹配模式

路由组件会在匹配完成，返回一个路由对象，包含各种参数名，控制器等，等待被注入到控制器中，这边主要借鉴的是```AngularJS```的注入体系

{% highlight javascript %}
define(function(require,exports,module){
	var routerObj = require("scripts/router");
	var route = function(url) {
		if(routerObj.hasOwnProperty(url)) {
			return routerObj[url];
		} else {
			for(route in routerObj) {
				if(routerObj[route].hasOwnProperty('regExp')) {
					var routeRegExp = new RegExp(routerObj[route].regExp);
					if(routeRegExp.test(url)) {
						/**
						 * Fix Bug: 修复多个参数无法获取到的问题
						 */
						var valueArr = url.match(routeRegExp),
							paramArr = route.match(/:([\w]*)/g);
						for(var i=1,len=valueArr.length;i<len;i++) {
							routerObj[route][paramArr[i-1].slice(1)] = valueArr[i];
						}
						return routerObj[route];
					}
				}
			}
			return null;
		}
	};
	module.exports = route;
});
{% endhighlight %}

### **依赖注入**

系统的核心，可以将各处注册，初始化的组件，注入到Controller中，被使用，比如说登陆的用户，路由信息，其他Service,Model都能被注入到控制器层，以免重复Require，主要用了Javascript的反射

{% highlight javascript %}
/**
 * Global Dependency Injector
 * @author megrez
 */
define(function(require,exports,module){
	/**
	 * [injector description]
	 * @param  {[type]} $scope [description]
	 * @return {[type]}        [description]
	 */
	var injector = function($scope) {
		this.all = {
			'$EventModel': require('scripts/models/EventModel'),
			'$UserModel': require('scripts/models/UserModel'),
			'$ApplyFormModel': require('scripts/models/ApplyFormModel')
		};
		this.deps = [];
		this.depStr = "";
	};
	/**
	 * [instantiate description]
	 * @param  {[type]} controller [description]
	 * @param  {[type]} $scope     [description]
	 * @return {[type]}            [description]
	 */
	injector.prototype.instantiate = function(controller,$scope) {
		var $inject = controller['$inject'] || [];
		this.all['$scope'] = $scope;
		this.deps = [];
		this.depStr = "";
		for(var i=0,len=$inject.length;i<len;i++) {
			this.deps.push(this.all[$inject[i]]);
			this.depStr += "args["+i+"],";
		}
		var IController = new Function('fn','args','return new fn('+ this.depStr.slice(0,-1) +');');
		return IController.apply(null,[controller,this.deps]);
	};
	/**
	 * [register description]
	 * @param  {[type]} moduleName [description]
	 * @param  {[type]} value      [description]
	 * @return {[type]}            [description]
	 */
	injector.prototype.register = function(moduleName,value) {
		this.all[moduleName] = value;
	};
	module.exports = injector;
});
{% endhighlight %}

只需要在Controller中，绑定一个```$injector```属性

{% highlight javascript %}
// XXXController.js
var Controller = function($scope, $User) {
};
Controller['$inject'] = ['$scope', 'User'];
// application.js 用注入器初始化对象
// 路由的结果被保存到$inject这个对象中
var tmp = injector.instantiate(controller, {
	'router': routeRes
});
{% endhighlight %}


### **全局请求**

在请求方面，做了切面处理，根据服务器端约定的协议，拦截数据；

在处理异步请求方面，我们用了```Q.js```来处理异步

当服务器返回HTTP级别的异常时，进行错误处理，抛出```WebService Error```

只有当服务器返回数据时，全局请求器先判断是否有协议内定义的关键字如CAPTCHA,EXPIRED等状态，这时抛出异常或者直接进行处理，其他情况都直接返回结果

最后返回一个```Promise```对象，可以链式调用，业务级别的错误在各控制器内分别处理

当然更好的做法是对业务错误有统一的处理，并且能够能够根据情况```Override```

{% highlight javascript %}
/**
 * 全局异步请求处理器
 * @required Q.js jQuery
 * @param {Object} data [Ajax参数]
 * @param {Boolean} options [传true会跳到homepage]
 * @example
 * {
 *     url: '/api/session/create',
 *     type: 'post',
 *     dataType: 'json'
 * }
 * @return {Q Promise} [200返回代码，handle函数处理服务器返回的异常;其他错误抛出WebService错误]
 */
$.globalResponseHandler = function(data, options) {
	data.cache = false;
	var handle = function(data) {
		switch (data.status) {
			case 'OK':
				return data;
				break;
			case 'Error':
				throw data.message;
				break;
			case 'Expired':
				/**
				 * Fix Bug: 修复由于path导致的无法清除cookie的问题
				 */
				$.removeCookie("userSession", {
					path: '/'
				});
				window.location.href = homepage;
				break;
			case 'CAPTCHA':
				throw "对不起，您请求过于频繁，请输入验证码后再试";
				break;
			case 'Not Logged In':
				$.removeCookie("userSession", {
					path: '/'
				});
				// window.location.href = homepage;
				break;
			case 'Permission Denied':
				throw "Permission Denied";
				break;
			case 'Inconsistent Argument':
				// Bug Track
				throw "Inconsistent Argument";
				break;
			default:
				throw data;
				break;
		}
	};
	return Q($.ajax(data)).then(function(data) {
		return handle(data);
	}, function(error) {
		seajs.log(error);
		throw "Web Service Error";
	});

};
{% endhighlight %}


### **表单验证工具**

由于表单在HTML前端重要的作用，我们自己做了一整套表单验证模块，代码略长，仅提供接口

{% highlight javascript %}
/**
 * 单个表单验证方法
 * @param  {String} value         表单的值
 * @param  {String} rules          表单的验证规则
 * @param  {Function} fnCallback    正确的处理方法
 * @param  {Function} errorCallback 错误的处理方法
 */
var formValid = function(value, rules, fnCallback, errorCallback) {};

/**
 * 验证表单，并在所有表单验证正确的时候返回表单数据
 * @param  {String} sel     [表单选择器]
 * @param  {Object} options [其他需要传输的对象]
 * @return {Boolean|Object} [当错误时返回false，正确时返回所有的对象]
 */
var getFormData = function(sel, options) {};
{% endhighlight %}

通过在模板中定义自定义的html属性来进行规则定义，然后拦截```submit```事件，调用```getFormData($formElement)```

getFormData内部会调用```formValid```来校验规则

如果返回数据那么表明验证成功，直接提交数据即可

如果返回数据是false，那么就提示错误

当然为了方便在```input```触发```blur```或者是```change```事件时，进行单独校验，所以第一个接口也是暴露的，并且能够传入两个回调函数


## Server

  1. 服务器
	
	用青云的服务，前端服务器就一台Debian虚拟机，双核2G，能够承受上万的访问量，并没有做特别的优化

  2. 部署

	主要采用scp上传完整包，服务器部署

	这边部署我们自己写了部署脚本，基于Shell的，采用plist文件列表指定版本号，并且能够产生log追溯问题版本

	具体的脚本放在github
	
	https://gist.github.com/lujiajing1126/eca5358fe7ab114bb83f