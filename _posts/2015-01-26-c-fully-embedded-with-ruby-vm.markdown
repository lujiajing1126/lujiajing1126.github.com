---
layout: post
title:  "把RubyVM嵌入C"
date:   2015-01-26 22:00:00
categories: creation
tags: [c,ruby]
icon: "http://en.gravatar.com/userimage/53661496/41e63450976c696dfd89c047c5148212.jpg?size=200"
---

这个想法来源于@penpen跟我说他在objective-C里面调用ruby的代码和gem包，然后我觉得也挺好玩的~就去试了一下

### 嵌入RubyVM

这一步比较简单

<!-- more -->
{% highlight ruby %}
#include <ruby.h>

int main(int argc,char ** argv) {
	ruby_sysinit(&argc, &argv);
	RUBY_INIT_STACK;
	ruby_init();
	ruby_init_loadpath();
	ruby_script("embedded");
	rb_require("rubygems");
	rb_require("enc/encdb");
	rb_require("./scripts/start.rb");
	ruby_finalize();
	exit(0);
}
{% endhighlight %}

### 加载gem包

> ruby_script("embedded")
> rb_require("rubygems");

这两句是确保ruby环境能够加载gem包

### 编译方法

{% highlight makefile %}
MAKE=gcc
CFLAGS=-I/Users/megrez/.rbenv/versions/2.1.2/include/ruby-2.1.0 -I/Users/megrez/.rbenv/versions/2.1.2/include/ruby-2.1.0/x86_64-darwin14.0 -g
LDFLAGS=-L/Users/megrez/.rbenv/versions/2.1.2/lib -lruby -ldl -lobjc

main: main.o
	$(MAKE) -o main main.o $(LDFLAGS)
{% endhighlight %}

### rbenv编译动态链接库

rbenv默认不会生成.so的动态链接库文件，只会生成.a的静态文件，所以需要重新编译ruby

参考这篇文章[rbenv/ruby-build and shared libraries (libruby.so)](http://stackoverflow.com/questions/23863895/rbenv-ruby-build-and-shared-libraries-libruby-so)

{% highlight bash %}
$ RUBY_CONFIGURE_OPTS="--enable-shared" benv install 2.1.2
{% endhighlight %}

一定要放在一行里面运行
