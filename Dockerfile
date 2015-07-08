FROM ruby
MAINTAINER Megrez Lu <lujiajing1126@gmail.com>

RUN apt-get update
RUN apt-get install -y node python-pygments
RUN gem install jekyll rdiscount kramdown emoji_for_jekyll

VOLUME /jekyll
ADD ./ /jekyll

WORKDIR /jekyll
ENTRYPOINT ["jekyll","s","-H","0.0.0.0"]
EXPOSE 4000
