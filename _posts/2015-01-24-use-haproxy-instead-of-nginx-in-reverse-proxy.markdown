---
layout: post
title:  "用Haproxy代替Nginx作为反向代理"
date:   2015-01-24 22:00:00
categories: ops
tags: [nginx,haproxy]
icon: "http://en.gravatar.com/userimage/53661496/41e63450976c696dfd89c047c5148212.jpg?size=200"
---

之前帮别人维护一台托管在idc的服务器，用Xen装的虚拟化系统，domain-0用的nginx作为反向代理，但是因为不在domain-0上面挂载站点，所以之前就打算用haproxy代替nginx作为反向代理

nginx和haproxy都是工作在OSI第七层的反向代理工具

<!-- more -->
之前用云智慧监控的时候发现，nginx到backend只会维护一个连接，后端nginx的并发数始终就是1

Xen的技术以后有时间整理一下再介绍

### 虚拟机配置

Domain-0 拥有外网IP 挂载在 xenbr0上面
Domain-1 局域网IP 192.168.122.127 网卡vif1.0 而vif1.0挂载在virbr0网桥上
...其他虚拟机类似

挂载

### nginx 作为反向代理的配置

```
upstream DomainXen1 {
	server	192.168.122.127;
}
server {
    listen       80;
    server_name  www.funnysay.com funnysay.com;

    #charset koi8-r;
    #access_log  /var/log/nginx/log/host.access.log  main;

    location / {
	proxy_set_header	Host	$host;
	proxy_set_header	X-Real-IP	$remote_addr;
	proxy_pass	http://DomainXen1;
    }
}
```

每个host都需要单独配置成一个conf文件，include到nginx-conf里面

比较复杂

### haproxy的配置

```
frontend http-in
	bind 0.0.0.0:80
	mode http
	log global
	option httplog
	option httpclose
	option forwardfor
	acl is_funnysay hdr_dom(host) -i www.funnysay.com
	acl is_yuxuanjp hdr_dom(host) -i www.yuxuanjp-jiaju.com
	use_backend funnysay if is_funnysay
	use_backend yuxuanjp if is_yuxuanjp
	default_backend funnysay

backend funnysay
	balance roundrobin
	cookie SERVERID
	option httpchk GET /index.html
	server web1 192.168.122.127:80 cookie web1 check inter 1500 rise 3 fall 3 maxconn 5000 weight 1
```

而haproxy通过配置acl来区分域名，然后传送到不同的backend服务器

### haproxy配置详解

> acl <aclname> <criterion> [flags] [operator] <value> ...

> acl is_funnysay hdr_dom(host) -i www.funnysay.com

配置```access list```,通过这块来定义host的匹配规则

> option httpchk

> option httpchk <uri>

> option httpchk <method> <uri>

> option httpchk <method> <uri> <version>

这个指令是配置http健康状态检查，主要有两种典型的用法

一个是通过http来进行

> option httpchk GET /index.html

另一种是直接通过tcp来检查

```
# Relay HTTPS traffic to Apache instance and check service availability
# using HTTP request "OPTIONS * HTTP/1.1" on port 80.
backend https_relay
    mode tcp
    option httpchk OPTIONS * HTTP/1.1\r\nHost:\ www
    server apache1 192.168.1.1:443 check port 80
```

以上这种方式能够适用多种协议，不仅仅是HTTP，这是haproxy比nginx强大的地方，它既能工作在4层，也能工作在7层

```
server <name> <address>[:port] [param*]
server web1 192.168.122.127:80 cookie web1 check inter 1500 rise 3 fall 3 maxconn 5000 weight 1
```

这是配置后端服务器的指令，主要是服务器的名字，地址和端口

Haproxy常用与为集群服务提供单一的入口

比如在twemproxy之前放置haproxy可以提供对redis集群的统一入口访问

可能以后的文章会涉及

### 状态监控

> stats enable
> stats auth  admin:AdMiN123

通过```stats```指令开启状态监控服务，这个方面要比nginx要好多了

截个图

![haproxy](/img/haproxy/QQ20150131-1.png)

### 总结

Haproxy单纯只是一款负载均衡软件，可以工作在4，7层，能够对session进行保持，对cookie进行引导

在并发处理上也比nginx来得出色，基于这两点，以及服务器的架构，我把nginx换成haproxy完全的正确的~

