(function(b,c){var $=b.jQuery||b.Cowboy||(b.Cowboy={}),a;$.throttle=a=function(e,f,j,i){var h,d=0;if(typeof f!=="boolean"){i=j;j=f;f=c}function g(){var o=this,m=+new Date()-d,n=arguments;function l(){d=+new Date();j.apply(o,n)}function k(){h=c}if(i&&!h){l()}h&&clearTimeout(h);if(i===c&&m>e){l()}else{if(f!==true){h=setTimeout(i?k:l,i===c?e-m:e)}}}if($.guid){g.guid=j.guid=j.guid||$.guid++}return g};$.debounce=function(d,e,f){return f===c?a(d,e,false):a(d,f,e!==false)}})(this);
$(function(){
    //主题星期变换颜色开始
    var dayweek=new Date().getDay(),
        slideout;
    //主题星期变换颜色结束
    NProgress.start();
    setTimeout(function () {
        NProgress.done();

    }, 500);
    var tags_a = $(".post-category");
    tags_a.each(function(){
        var x = 4;
        var y = 0;
        var rand = parseInt(Math.random() * (x - y + 1) + y);
        $(this).addClass("post-category-"+rand);
    });
    $(window).scroll(function() {
        if($(window).scrollTop() >= 100){
            $('.topfade').fadeIn(300);
        }else{
            $('.topfade').fadeOut(300);
        }
    });

    $('.topfade').click(function(){
        $('html,body').animate({scrollTop: '0px'}, 800);});
    
    slideout = new Slideout({
        'panel': $('#layout > .content')[0],
        'menu': $('#layout > .sidebar')[0],
        'padding': 256,
        'tolerance': 70
    });
    $(document).on('click','#expand-menu',function() {
        if(slideout != undefined)
            slideout.toggle();
    });
    // Fix Menu Open Bug
    $(window).on('resize',$.throttle('1000',function() {
        if($(window).width() > 768 && slideout.isOpen()) {
            slideout.toggle();
        }
    }))
});