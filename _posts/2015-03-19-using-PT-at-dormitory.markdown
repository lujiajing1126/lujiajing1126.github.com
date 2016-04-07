---
layout: post
title:  "同时使用PPPoe和局域网"
date:   2015-03-19 22:00:00
categories: creation
tags: [openwrt,network,pppoe]
icon: "//en.gravatar.com/userimage/53661496/41e63450976c696dfd89c047c5148212.jpg?size=200"
---

> 目的是为了在复旦南区宿舍使用电信的网，同时使用校园内网，以openwrt为例

## 硬件配置
<!-- more -->

  - 校园内部网端口
  - 电信宽带
  - 路由器，newifi mini，售价129

## 路由器配置

### 路由器基本设置

为了能够进入到路由器内部进行配置，首先安装newifi的Telnet插件，这是一款白插件，下载到bpk，直接安装到路由器

然后telnet到路由器，用户名是root，密码是路由器的管理密码

### 手动启动udhcpd

由于在路由器上面选择了PPPoe拨号，所以默认没有打开dhcp客户端

我们首先观察一下路由器的网络配置，主要是以下命令

{% highlight bash %}
brctl show # 查看网桥
route # 查看路由表
ifconfig # 查看网络接口配置
{% endhighlight %}

该路由器网桥是br-lan，上面有eth2.1,ra1.0,rai1.0几个port

我猜想ra1.0和rai1.0应该是无线网络的接口

通过路由器网络切换，发现eth2.2是wan口的网络接口

然后手动启动udhcpd

```
udhcpd -i eth2.2
```

此时路由器会调用脚本，把dhcp获取到的ip和网关设置为默认的路由

这时会发现内网，外网全都上不去了！不过不要紧，这个很正常

### 路由表配置

首先删除默认路由

```
route del default
```

再把默认路由改成走pppoe，加入pppoe的网络接口是ppp-wan的话

```
route add default dev ppp-wan
```

然后把所有的内网接口设置为走宿舍网关，假设网关是10.106.0.1

```
route add -net 10.0.0.0/8 gw 10.106.0.1 dev eth2.2
```

所有的内网地址如下

  - 10.0.0.0/8
  - 61.129.42.0/24
  - 175.186.0.0/15
  - 202.120.64.0/20
  - 202.120.224.0/20
  - 202.120.247.0/24

### NAT设置

经过以上配置，你能够在路由器上面访问校园网啦~不过在你的局域网里面还是没法访问

测试方法：路由器

```
ping 10.107.0.76 # 复旦学生会网站的内网IP
```

当然最后也很简单，设置SNAT

```
iptables -t nat -A postrouting_rule -s 192.168.0.0/16 -o eth2.2 -j MASQUERADE
```

伪装一下源地址就好啦，然后你就能在寝室不断开外网的时候下载PT了~