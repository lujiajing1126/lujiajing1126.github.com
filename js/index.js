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
    })
});