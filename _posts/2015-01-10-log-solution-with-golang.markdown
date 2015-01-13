---
layout: post
title:  "Fluentd + InfluxDB + Grafana 日志收集的实践"
date:   2015-01-10 22:00:00
categories: solution
tags: [ruby,golang,influxdb,grafana,fluentd]
icon: "/img/logo.png"
---

> 本文是基于ruby-china上提出的开源日志收集方案所作的实践

方案的提出在这篇:

[李华顺: InfluxDB + Grafana 快速搭建自己的 NewRelic，分析应用运行情况](https://ruby-china.org/topics/23470)

<!-- more -->
## 安装

### InfluxDB

用HomeBrew

{% highlight bash %}
$ brew update
$ brew install influxdb
{% endhighlight %}

### Grafana

{% highlight bash %}
$ wget http://grafanarel.s3.amazonaws.com/grafana-1.9.1.tar.gz
$ tar zxf grafana-1.9.1.tar.gz
$ cd grafana-1.9.1
$ python -m SimpleHTTPServer
Serving HTTP on 0.0.0.0 port 8000 ...
{% endhighlight %}

### Fluentd

因为我们依赖于```Fluentd```做日志收集，我们后台用的ruby，所以直接用gem安装就好了

{% highlight bash %}
$ gem install fluentd
{% endhighlight %}

## 收集打点

huacnLee的方案中，主要是对Rails提供的web服务的监控，所以只需要用到```ActiveSupport::Notifications.subscribe```订阅Controller::Action就好

在我们的后台主要是Grape提供API服务，所以我们需要利用Rack和Grape的中间件机制，插入到API运行的过程中，获取运行数据

如果是直接让Service把数据导入到influxdb在高并发下可能会有效率问题，所以采用各个Service先写log文件，Fluentd采集数据，上传数据库的方式

日志记录我们用最简单的Ruby自带的Logger就行了，当然还有其他方案，只要最后输出JSON就行了

### Rack

在这一层面上，我们不需要自己统计运行时间，我们只需要拿到```ResponseHeader```中的```X-Runtime```就行了

{% highlight ruby %}
equire 'logger'
require 'json'
require 'time'
module WhosvPerformance
  module Rack
    class WhosvRackDebugger
      def initialize(app)
        @app = app
      end

      def call(env)
        @env = env
        before_log
        status, headers, body = @app.call env
        log_runtime headers
        [status, headers, body]
      end
      private
      def before_log
        @whosv_performance_logger = Logger.new('rpm.log')
        original_formatter = Logger::Formatter.new
        @whosv_performance_logger.formatter = proc { |severity, datetime, progname, msg|
          {:severity => severity,:datetime => datetime.strftime("%Y-%m-%d %H:%M:%S")}.merge(msg).to_json << "\n"
        }
      end
      def log_runtime headers
        @whosv_performance_logger.info ({:method => @env['REQUEST_METHOD'],:path => @env['REQUEST_PATH'],:runtime => headers['X-Runtime'].to_f,:component=>"Rack"})
      end
    end
  end
end
{% endhighlight %}

当然你需要把你的中间件插入到Rails的RackStack里面，注意顺序，由于RackMiddlewares的结构是栈，FILO，需要插到Runtime插件之上

{% highlight ruby %}
config.middleware.insert_before Rack::Runtime,WhosvPerformance::Rack::WhosvRackDebugger
{% endhighlight %}

### Grape

{% highlight ruby %}
require 'logger'
require 'json'
require 'time'
module API
  module Middleware
    class WhosvPerformance < Grape::Middleware::Base
      def before
        @whosv_performance_logger = Logger.new('rpm.log')
        original_formatter = Logger::Formatter.new
        @whosv_performance_logger.formatter = proc { |severity, datetime, progname, msg|
          {:severity => severity,:datetime => datetime.strftime("%Y-%m-%d %H:%M:%S")}.merge(msg).to_json << "\n"
        }
        @whosv_start_time = Time.now
        puts @app
        nil
      end
      def after
        puts "End Grape"
        @whosv_end_time = Time.now
        whosv_api_runtime = @whosv_end_time - @whosv_start_time
        @whosv_performance_logger.info result_runtime(whosv_api_runtime)
        nil
      end

      private
      def result_runtime runtime
        {
            :method => @env['REQUEST_METHOD'],
            :path => @env['REQUEST_PATH'],
            :runtime => runtime,
            :component => 'Grape'
        }
      end
    end
  end
end
{% endhighlight %}

这里有一点需要注意，可能你发现有时候Rack记到了点，但是Grape没有记录到，因为如果你需要在Grape中在半路不显示return，但需要结束整个api调用

所以你用了```error!(hash,status)```方法

该方法是```Grape::DSL```提供的内置方法，他会抛出一个```:error```，所以你的收集代码运行，就被catch住了

## 订阅日志

我们用Fluentd内置的input插件来收集，输出需要安装[fluent-plugin-influxdb](https://github.com/fangli/fluent-plugin-influxdb)的插件

### 安装:
{% highlight bash %}
$ fluent-gem install fluent-plugin-influxdb
{% endhighlight %}

注意最后可能你的安装版本略旧，怎么也没法上传，这时候用源码替换一下

### 配置

我们用tail方式监听文件变动，该插件是一个基于buffered的fluentd插件，默认flush时间是60秒，所以结果并非是实时的

{% highlight xml %}
## File input
## read apache logs with tag=apache.access
<source>
  @type tail
  format json
  time_key datetime
  time_format %Y-%m-%d %H:%M:%S
  path /Users/megrez/Code/whosv/whosv-rails/rpm.log
  pos_file /Users/megrez/Code/whosv/whosv-rails/rpm.log.pos
  tag api.performance
</source>
<match api.performance>
  @type influxdb
  host localhost
  port 8086
  dbname whosv_rails_dev
  user root
  password root
  time_precision s
</match>
{% endhighlight %}

## Grafana

按之前的帖子配置一下Grafana

就能看到界面，里面的图按照自己的需求画就行了，这块就比较简单了

## 总结

整个方案比较轻量级，比之```Flume-ng + Apache-Avro + MQ + Kafka + Storm/Hadoop + Kibana```要容易很多

我觉得比较适合后端是Ruby的项目，在收集器这方面我只是做了一些尝试，具体可以参考

[newrelic/rpm](https://github.com/newrelic/rpm)

[Measuring Performance in Grape APIs With NewRelic RPM](http://artsy.github.io/blog/2012/11/29/measuring-performance-in-grape-apis-with-new-relic/)

[xinminlabs/newrelic-grape](https://github.com/xinminlabs/newrelic-grape)

[stevebartholomew/newrelic_moped](https://github.com/stevebartholomew/newrelic_moped)

以上包括了Grape层面的记录，数据库查询等的记录等

数据有了，分析的方法可能还比较局限，包括InfluxDB本身还不完善，主要还是适用于时间序列的分析

方案离实践还比较远，还需要做很多工作，本文权当抛砖引玉
