$(function () {
    $(".article a").attr("target", "_blank");
    $(".brand-title,.brand-tagline,nav").remove();
    $(".headerpic img").css("width", "100px");
    // $('#toc').toc({'container': '.article', 'selectors': 'h1,h2,h3', prefix: 'top'});
    $('.article').each(function (i) {
        $(this).find('img').each(function () {
            if ($(this).parent().hasClass('fancybox')) return;
            $(this).wrap('<a href="' + this.src + '" title="' + this.title + '" class="fancybox"></a>');
        });
        $(this).find('.fancybox').each(function () {
            $(this).attr('rel', 'article' + i);
        });
    });
    if ($.fancybox) {
        $('.fancybox').fancybox({
            padding: 0,
            openEffect: 'elastic',
            closeEffect: 'elastic',
            helpers: {
                title: {
                    type: 'inside'
                },
                overlay: {
                    css: {
                        'background': 'rgba(255,255,255,0.5)'
                    }
                }
            }

        });
    }
    ;
});