---
layout: post
title:  "HybridApp 增量更新解决方案"
date:   2014-12-18 22:00:00
categories: solution
tags: [ruby,android]
icon: "/img/logo.png"
---

> 本文是之前发在ruby-china上的帖子

第一次发帖= =喵

今年早些时候就想过做一些HybridApp方面的尝试，我认为HybridApp的优势有以下两点

  - 对于初创公司，手机Web，iOS，安卓可以使用统一的H5提供的界面，减少开发成本
  - 更新及时，服务器端更新，客户端不管新旧版本能够立即看到效果，尤其对于iOS漫长的审核周期，再也不用被老板天天盯着了

但是混合型的应用也往往因为工程师水平有限或者H5/CSS3兼容或者特效不流畅，以及最重要的浪费流量而饱受诟病

之前因为一些原因一直心里想着然后没时间去实现，最近在我们的应用（ `奢圈WHOSV` ）里面用了HybridApp构架，发现还是非常爽的，打个广告大家可以搜一下我们的APP啦啦啦~

之所以称之为构架，因为我们在多方面做了很多联合的解决方案，在这过程中我们发现有几个问题是需要重点考虑

<!-- more -->

  - 缓存问题
  - 增量更新问题
  - 客户端App向WebView/UIWebview注入JS问题
  - ...

反正是各种坑= =。。所以感觉之前的决定也是对的。。没有时间精力千万不要去轻易尝试。。

这篇重点介绍我们在增量更新方面的解决方案，求轻喷TAT（其他的大家有兴趣我再整理下= =）：

## 首先是增量更新的方案

我们看了InfoQ上面腾讯前端团队在AndroidQQ上的解决方案的介绍，发现他们的方案不太适合我们

给出Keynote链接 ```http://vdisk.weibo.com/s/A0GI9rXObukZ```

跪谢Rehorn大神的keynote，启发了我们

腾讯：

  - 使用bsdiff和bspatch作为增量更新的比较和打包工具，需要在安卓，iOS都加入Native支持，虽然就俩文件，但也比较烦
  - 使用zip需要每个版本做比较，在版本更新方面可能需要下载多个zip包覆盖才行，对于服务器端发布流程和构架需要做比较大的改动，不方便！
  - zip包不能压缩，只能使用打包模式，这个是由于`bsdiff`使用`LCS`算法带来的问题，另外js文件minify也有可能带来增量包变大的问题

LCS算法详见：```http://en.wikipedia.org/wiki/Longest_common_subsequence_problem```


WHOSV：

  - 使用单个文件全量更新的方案，对文件列表中的单个文件比较`md5`或者`sha1`摘要进行比较
  - 利用nginx自带的gzip压缩，不需要改变之前的发布流程，可以混淆！可以压缩JS！

在安全方面我们参考Debian更新软件包时提出的Secure Apt方案，我们提出基于HTTP的方案
```https://wiki.debian.org/SecureApt```
当然Debian是基于`Gnugpg`的实现，我们换成只用RSA

  1. 首先，客户端在发布时有一枚RSA的公钥，并且把网页的模块打包在apk(ipa)中
  2. 当触发更新时，客户端向服务器端请求Release.rsa文件和Release文件，其中Release.rsa文件是用RSA私钥加密的Release文件
  3. 客户端利用公钥解密Release.rsa并且与Release的文件内容验证，用于校验服务器的可信以及Release文件可信
  4. 客户端下载Packages文件，里面存了某个site下，某个modules的全部内容：```www.site.com/module/Packages```
  5. 利用得到的Release中对Packages文件的摘要，验证Packages文件的可信
  6. 与旧版本额Packages作比较，增量下载改动的文件，一般就是几个JS，CSS，可能就几个KB大小，经过Gzip能更小，覆盖

以上就是安全方面的整个信任链

当然土豪公司完全可以利用Https证书来完成信任链的建立

有一篇文章讲的比较好：除了翻译有些问题

**HTTPS连接的前几毫秒发生了什么**
```http://blog.jobbole.com/48369/```


## 然后我们为服务器端发布写了一个Gem

用Gli写的一个命令行工具，目前还不是特别完善= =其实

用于
  - 创建RSA密钥对
  - 生成站点下某个模块站点的所有文件列表
  - 对文件列表进行生成摘要，并进行RSA签名

地址： ```https://github.com/lujiajing1126/genRelease```

具体用法

{% highlight bash %}
// 目录结构
// -public
// n someModule
// n otherModule
cd public
gem install genRelease
// 在当前目录生成RSA密钥对
genRelease create
// 对当前目录下某个模块生成文件列表
genRelease --verbose build --host-name=www.yoursite.com someModule
// 签名
genRelease sign
{% endhighlight %}

其他的部分，比如说Webview注入之后，网页部分调用原生部分，我们写了一个框架，有点类似Weixin的API恩

 ```https://github.com/lujiajing1126/WhosvBrowserJSBridge```

就说这么多，感觉好弱。。= =写实验报告去了囧