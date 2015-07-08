FROM jekyll/stable
MAINTAINER Megrez Lu <lujiajing1126@gmail.com>

ENV UPDATE_GEMFILE true
ENV BUNDLE_CACHE true
ENV NOISY_INSTALL true

ADD ./ /srv/jekyll

EXPOSE 80