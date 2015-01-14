---
layout: post
title:  "安卓上TextView和EditText的实现概述以及各种坑"
date:   2015-01-14 22:00:00
categories: android
tags: [textview,emoji,edittext]
icon: "/img/logo.png"
---

> 我表示我真的只有几个月安卓经验，这两天搞TextView和EditText的问题搞得头大，研究了一下他们的实现

## TextView

TextView在安卓UI中主要用来显示纯文本，他继承自View，实现了ViewTreeObserver.OnPreDrawListen接口

{% highlight java %}
public class TextView extends View implements ViewTreeObserver.OnPreDrawListener {}
{% endhighlight %}

<!-- more -->
### 触发触摸事件

简单的问题就不说了，故事从手指触碰到TextView开始

手指的触摸事件触发了ViewTreeObserver的OnTouchModeChangeListener

从No Touch变成了Touch

OnTouchModeChangeListener可以添加并实现新的接口来触发OnTouchEvent函数，用于拦截并实现自定义事件

比如可以实现触发其他事件监听器

### 可选中/可编辑的接口

这里首先有几个比较重要的方法

{% highlight java %}
/**
 * Subclasses override this to specify that they have a KeyListener
 * by default even if not specifically called for in the XML options.
 */
protected boolean getDefaultEditable();

/**
 * Subclasses override this to specify a default movement method.
 */
protected MovementMethod getDefaultMovementMethod();

/**
 * Return the text the TextView is displaying as an Editable object.  If
 * the text is not editable, null is returned.
 *
 * @see #getText
 */
public Editable getEditableText();

 /**
 *
 * Returns the state of the {@code textIsSelectable} flag (See
 * {@link #setTextIsSelectable setTextIsSelectable()}). Although you have to set this flag
 * to allow users to select and copy text in a non-editable TextView, the content of an
 * {@link EditText} can always be selected, independently of the value of this flag.
 * <p>
 *
 * @return True if the text displayed in this TextView can be selected by the user.
 *
 * @attr ref android.R.styleable#TextView_textIsSelectable
 */
public boolean isTextSelectable();
{% endhighlight %}

这几个属性决定了这个View能不能被点中，或者被编辑

### 内部类SelectionCursorController与CursorHandle

https://github.com/zhouray/SelectableTextView/blob/master/src/com/zyz/mobile/example/SelectableTextView.java

SelectionCursorController是一个内部类，实现了OnTouchModeChange接口，用于响应TouchMode改变的事件

CursorHandle是一个View，用于实现被选中文字两边显示的箭头，但作者写的是有问题的，箭头会飘

这里作者的控件并没有Override父类的isTextSelectable和getDefaultEditable方法，所以不会把上线文菜单托管给系统

这里把事件的处理交给了内部类，从而对可选区域进行选中操作

而选择的操作则是由SelectionInfo来完成的，这是一个集合类，用于操作Selection

## EditText

### 实现

EditText重载的方法非常少，主要是setSelection之类的方法，还有就是上面提到的isTextSelectable和getDefaultEditable方法

### 多行文本的实现

EditText的多行文本主要由这几个参数决定

```
inputType
maxLines
singleLine
```

如果把singleLine设置成false会把所有的相关的参数都重置，参考谷歌的文档

```
setSingleLine(boolean singleLine)
If true, sets the properties of this field (number of lines, horizontally scrolling, transformation method) to be for a single-line input; if false, restores these to the default conditions.
```

所以在写自定义控件的时候必须把setSingleLine写在maxLines之前，否则该属性会被重置

{% highlight java %}
...
valueEditText.setSingleLine(isSingleLine);
valueEditText.setMaxLines(array.getInt(R.styleable.WhosvWidget_android_maxLines, 1));
valueEditText.setInputType(array.getInt(R.styleable.WhosvWidget_android_inputType, InputType.TYPE_CLASS_TEXT));
...
{% endhighlight %}

并且，只用maxLines是无法控制最大行数的，它只能够确定显示的最大行数

所以必须要自己添加逻辑，这里有两个选择，一个是重载OnKeyListener方法，在响应键盘事件的时候做拦截

另一种，可以重载OnTextChange方法，在afterTextChange中写逻辑

下面提供第一种方法的实现

{% highlight java %}
valueEditText.setOnKeyListener(new View.OnKeyListener(){
  @Override
  public boolean onKey(View v, int keyCode, KeyEvent event) {
    int MaxLines = ((EditText)v).getMaxLines();
    if (!isSingleLine && MaxLines > 1 && keyCode == KeyEvent.KEYCODE_ENTER && event.getAction() == KeyEvent.ACTION_UP) {
      // 获取光标所在位置
      int index = ((EditText)v).getSelectionStart();
      // 获取EditText文本内容
      String text = ((EditText)v).getText().toString();
      // 获取行数
      if(text.substring(index-1,index).equals("\n"))
        index = index - 1;
      String singleEnterText = text.replaceAll("[\\n]+","\n");
      ((EditText) v).setText(singleEnterText);
      int editTextRowCount = ((EditText) v).getLineCount();
      if(index > singleEnterText.length())
        index = singleEnterText.length();
      ((EditText) v).setSelection(index);
      Timber.d("text:"+text+",rows:"+editTextRowCount+",maxLines:"+MaxLines);
      if(editTextRowCount > MaxLines) {
        int lastBreakIndex = text.lastIndexOf("\n");
        String newText = text.substring(0, lastBreakIndex);
        ((EditText) v).setText("");
        ((EditText) v).append(newText);
      }
    }
    return false;
  }
});
{% endhighlight %}

## ActionMode的用法

当然在复制的时候，普遍有两种方法，一种是以Context Menu的方式，另一种是ActionMode

ActionMode的方法比较简单，```setActionMode(ActionMode.Callback callback)```

{% highlight java %}
private ActionMode.Callback mActionModeCallback = new ActionMode.Callback() {

    // Called when the action mode is created; startActionMode() was called
    @Override
    public boolean onCreateActionMode(ActionMode mode, Menu menu) {
        // Inflate a menu resource providing context menu items
        MenuInflater inflater = mode.getMenuInflater();
        inflater.inflate(R.menu.context_menu, menu);
        return true;
    }

    // Called each time the action mode is shown. Always called after onCreateActionMode, but
    // may be called multiple times if the mode is invalidated.
    @Override
    public boolean onPrepareActionMode(ActionMode mode, Menu menu) {
        return false; // Return false if nothing is done
    }

    // Called when the user selects a contextual menu item
    @Override
    public boolean onActionItemClicked(ActionMode mode, MenuItem item) {
        switch (item.getItemId()) {
            case R.id.menu_share:
                shareCurrentItem();
                mode.finish(); // Action picked, so close the CAB
                return true;
            default:
                return false;
        }
    }

    // Called when the user exits the action mode
    @Override
    public void onDestroyActionMode(ActionMode mode) {
        mActionMode = null;
    }
};

someView.setOnLongClickListener(new View.OnLongClickListener() {
    // Called when the user long-clicks on someView
    public boolean onLongClick(View view) {
        if (mActionMode != null) {
            return false;
        }

        // Start the CAB using the ActionMode.Callback defined above
        mActionMode = getActivity().startActionMode(mActionModeCallback);
        view.setSelected(true);
        return true;
    }
});
{% endhighlight %}

## 其他参考

[Android自由选择TextView的文字](http://chroya.iteye.com/blog/753634)

这个文章写的比较简单，但是的确可以实现，网上其他的大部分文章写的都做不到