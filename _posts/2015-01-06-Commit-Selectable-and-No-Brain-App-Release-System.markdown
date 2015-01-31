---
layout: post
title:  "奢圈自动化打包系统搭建"
date:   2015-01-06 22:00:00
categories: automation
tags: [spinejs,gradle]
icon: "/img/logo.png"
---

> 分享一下奢圈在自动化打包系统构建中的实践，主要为了解决测试小伙伴无法得到最新版本以确定Bug是否修复的问题

我们的测试一直在抱怨让工程师打包真的很艰难，之前我们规定了每天早上打包，不过大家都懒癌晚期，有时候就完全不记得有这件事

测试也不是一直有时间做测试，还得去催工程师，导致我们trello验收板块囤积了几周的验证任务

测试不知道他得到的版本是否是最新的，也不知道修复了哪些问题

<!-- more -->

归结下来就两个问题:

  - 无法自动打包
  - 无法明确版本号

## 前提

在之前的邮件沟通中，我数次提到了自动化构建的重要性，并且提出每个版本需要带上打包时间，Commit版本号

每一条Commit记录需要写清楚修复了哪些问题，一个Commit解决的问题不宜过多，最好是相关的1~2个小问题

这在我们最近的git提交记录中大为改观

```
commit d3f855125b59cf398eae2aaae53d20d94e3fbc4b
Author: Sanvi Lu <sanvibyfish@gmail.com>
Date:   Tue Jan 13 19:05:20 2015 +0800

    修复添加好友时，秋波会推送

commit fccaf23e428b555f3d3b230dbcb92e7a5927327f
Author: megrez <lujiajing1126@gmail.com>
Date:   Tue Jan 13 16:24:53 2015 +0800

    修复发送框问题
```

当然这距离我们想要的结果还有一段距离，希望能够在Commit记录中带上解决的问题的 #Issue 号码，主要是开发，测试流程上需要改进

以上是实现打包系统的前提条件

## 自动化打包系统

### 前端

其实前端所做的不过是一个和Gitlab的Api接口连接的显示界面

我用的SpineJS，从网上拉了一堆界面，因为其他同事不想工程师不在意界面之类的，所以还是有必要做的好看一点

![Release](/img/release-system/QQ20150114-1.png)

测试可以看到所有的提交记录，选择任意的版本进行打包

![Release](/img/release-system/QQ20150114-2.png)

### 安卓自动化打包

我主要做安卓就讲一下安卓这块

安卓这边主要用```gradle```进行自动打包

在服务器上根据打包的时间点，clone代码，并且checkout到指定的commit，运行gradle build就行了

安卓这边实现带版本号和Commit记录的版本很简单

gradle 脚本支持插入 groovy代码，只要在groovy中拿到打包的时间，再在安装界面去取BuildConfig参数就行了

{% highlight groovy %}
buildConfigField "long", "TIMESTAMP", System.currentTimeMillis() + "L"
{% endhighlight %}

安卓

{% highlight java %}
buildDateLayout.setValue(io.nothing.utils.DateUtils.formatDateYMDHMS(new Date(BuildConfig.TIMESTAMP)));
{% endhighlight %}

### Issue提取

我们要求工程师在提交commit的时候，在commit message最开头加上[WHOSV#1]这样的文字

在提交系统中会突出显示，并且点击后能够链接到指定的issue，查看评论等信息

方便测试人员确认修复的细节等