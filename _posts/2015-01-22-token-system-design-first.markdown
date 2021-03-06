---
layout: post
title:  "token系统设计草稿（一）"
date:   2015-01-14 22:00:00
categories: solution
tags: [token,server,safety]
icon: "/img/logo.png"
---

> 最近一直在考虑奢圈3.0的api体系的重构

<!-- more -->
## 概述

在之前奢圈的token是静态的，安全性比较差，但是考虑到用户也不多，需求更为紧张所以没有考虑太多

我觉得静态的Token有几个不好的地方

 - 一旦泄露没有还手的余地，安全性太差
 - 用户如果拿到token可以跳过登陆，直接访问接口，没有办法根据活跃等情况踢下线
 - 对于之后的其他需求可能造成不利
 - 只有登陆用户有token，对为授权的接口起不到保护作用
 - ...

可能还有很多其他的问题就不一一罗列

## 设计理念

Token分为两种，至少在功能上

 - 未授权Token
 - 授权Token，相当于Session

未授权Token起到保护未登录就能调用的接口的效果

授权的Token即用户的令牌，也能够起到保护接口的作用，包括活跃度等信息检查等

## 设计细节

### 未授权Token的获取

用户根据IP获取到一个Key-Secret，有效期为一天，一天内只能拿到某个固定的Key-Secret

通过Key-Secret调用获取未授权Token，返回一个Token，一个Key-Secret一天只能调用3000次，从而防止IP的攻击

未授权Token的有效期比较短，可能在5-10分钟，之后就过期，并且一个Token有```耐久度```，如果调用太频繁就被封禁了

### 授权的转化

用户通过未授权Token调用登陆接口来换取授权Token

### 授权Token的设计与实现

还没想好
