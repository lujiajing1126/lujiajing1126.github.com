FROM ruby
MAINTAINER Megrez Lu <lujiajing1126@gmail.com>

RUN apt-get update

#Install nodejs and pygments for jekyll
RUN apt-get install -y node python-pygments

# Install nginx
RUN apt-get install -y software-properties-common
RUN add-apt-repository -y ppa:nginx/stable
RUN apt-get install -y nginx
# Close Daemon Mode
RUN echo "\ndaemon off;" >> /etc/nginx/nginx.conf
RUN chown -R www-data:www-data /var/www/html

# Modify Sources
RUN gem sources --remove https://rubygems.org/
RUN gem sources -a http://ruby.taobao.org/

# Install gem dependency
RUN gem install jekyll rdiscount kramdown emoji_for_jekyll

# Add default nginx config
ADD nginx-config.conf /etc/nginx/sites-enabled/default

RUN mkdir -p /jekyll
ADD ./ /jekyll

WORKDIR /jekyll
RUN jekyll build
RUN cp -R ./_site/* /var/www/html

ENTRYPOINT nginx
EXPOSE 80