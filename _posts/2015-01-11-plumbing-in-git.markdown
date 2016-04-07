---
layout: post
title:  "Git Plumbing -- Git底层命令"
date:   2015-01-11 22:00:00
categories: git
tags: [plumbing,pack,index]
icon: "//en.gravatar.com/userimage/53661496/41e63450976c696dfd89c047c5148212.jpg?size=200"
---

> 最近看到这篇文章[自己动手写 Git HTTP Server](http://io-meter.com/2014/07/09/simple-git-http-server/)，由此一窥Git的博大精深

<!-- more -->
其实之前也看过这个作者写的另一篇让我感觉非常牛逼闪闪的文章[使用 WebGL 实现素描效果的渲染](http://io-meter.com/2014/12/31/sketch-rendering/)

感觉大家都在做一些非常有意思的实践

趁看到这篇文章的机会，进一步学习一下Git的底层命令和方法

## 一些基本原理

### 松散文件(Loosen)和打包文件(Packed)

松散对象是一种比较简单格式. 它就是磁盘上的一个存储压缩数据的文件. 每一个对象都被写入一个单独文件中.

如果你对象的SHA值是ab04d884140f7b0cf8bbf86d6883869f16a46f65, 那么对应的文件会被存储在:

```
GIT_DIR/objects/ab/04d884140f7b0cf8bbf86d6883869f16a46f65
```

可以用下面的Ruby代码说明对象数据是如何存储的:

{% highlight ruby %}
def put_raw_object(content, type)
  size = content.length.to_s

  header = "#{type} #{size}\0" # type(space)size(null byte)
  store = header + content

  sha1 = Digest::SHA1.hexdigest(store)
  path = @git_dir + '/' + sha1[0...2] + '/' + sha1[2..40]

  if !File.exists?(path)
    content = Zlib::Deflate.deflate(store)

    FileUtils.mkdir_p(@directory+'/'+sha1[0...2])
    File.open(path, 'w') do |f|
      f.write content
    end
  end
  return sha1
end
{% endhighlight %}

另外一种对象存储方式是使用打包文件(packfile). 由于Git把每个文件的每个版本都作为一个单独的对象, 它的效率可能会十分的低. 设想一下在一个数千行的文件中改动一行, Git会把修改后的文件整个存储下来, 很浪费空间.

Git使用打包文件(packfile)去节省空间. 在这个格式中, Git只会保存第二个文件中改变了的部分, 然后用一个指针指向相似的那个文件

你最终会需要把对象存放到打包格式中去节省磁盘空间 - 这个工作可以通过git gc来完成. 它使用一个相当复杂的启发式算法去决定哪些文件是最相似的, 然后基于此分析去计算差异. 可以存在多个打包文件, 在必要情况下, 它们可被解包(git unpack-objects)成为松散对象或者重新打包(git repack).

数据结构如下：(Version 1 对应 git 1.6之前，Version 2 对应 git 1.6之后，但可被 git 1.5.2之后的版本识别)

![packfile-index](http://gitbook.liuhui998.com/assets/images/figure/packfile-index.png)

### Git引用

分支(branch), 远程跟踪分支(remote-tracking branch)以及标签(tag)都是对提交的引用. 所有的引用是用"refs"开头, 以斜杠分割的路径. 到目前为此, 我们用到的引用名称其实是它们的简写版本

```
- 分支"test"是"refs/heads/test"的简写.
- 标签"v2.6.18"是"refs/tags/v2.6.18"的简写.
- "origin/master"是"refs/remotes/origin/master"的简写.
```

> 新创建的引用会依据它们的名字存放在.git/refs目录中. 然而, 为了提高效率, 它们也可能被打包到一个文件中, 参见git pack-refs

显示某分支特有的提交:

{% highlight bash %}

megrez@MegrezAir  ~/Code/project/whosv/whosv-rails   feature/influxdb  git show-ref --heads
2ea5218c3c5eebe5fa12e294c58e3cafd858b285 refs/heads/develop
0d8beadfb19f19ba38371677128e1211e7ed908d refs/heads/feature/influxdb
9e1ea37f22cb60a0c65282fc2ad1cb492a3184c4 refs/heads/feature/ranks
e8f7bbae896d2dc9b5a6abb56fccabc5decbfa4c refs/heads/feature/usersearch
bdc413268e0a90c18d6068a035eb5b07eeb15aaf refs/heads/master
{% endhighlight %}

### Git索引

通常存放在```.git/index```内

可以用```git ls-files```查看

## Git底层命令
以下是一个非常典型的.git文件目录

{% highlight bash %}
megrez@MegrezAir  ~/Code/project/whosv/whosv-rails   feature/influxdb  ll .git
total 272
-rw-r--r--    1 megrez  staff    10B  1  7 01:55 COMMIT_EDITMSG
-rw-r--r--    1 megrez  staff   2.3K 10 26 19:56 COMMIT_EDITMSG~
-rw-r--r--    1 megrez  staff   959B  1 13 23:04 FETCH_HEAD
-rw-r--r--    1 megrez  staff    33B  1 13 23:05 HEAD
-rw-r--r--    1 megrez  staff   310B 11 15 10:45 MERGE_MSG~
-rw-r--r--    1 megrez  staff    41B  1  7 01:33 ORIG_HEAD
-rw-------    1 megrez  staff    96B 10 11 12:21 TAG_EDITMSG
-rw-------    1 megrez  staff    68B 10 11 12:19 TAG_EDITMSG~
-rw-r--r--    1 megrez  staff   681B  1 13 23:05 config
-rw-r--r--    1 megrez  staff   753B 10 15 11:49 config~
-rw-r--r--    1 megrez  staff    86K  1 13 23:05 index
drwxr-xr-x    4 megrez  staff   136B  9  6 20:10 logs
drwxr-xr-x  260 megrez  staff   8.6K  9 25 18:24 objects
-rw-r--r--    1 megrez  staff    39B 11 15 10:48 packed-refs
drwxr-xr-x    5 megrez  staff   170B 11 14 23:52 refs
-rw-r--r--@   1 megrez  staff   362B 10 11 12:37 sourcetreeconfig
{% endhighlight %}

### 查看一个Hash的类型

显示为Commit

{% highlight bash %}
megrez@MegrezAir  ~/Code/project/whosv/whosv-rails   feature/influxdb  git cat-file -t 5575dbb05f40d04553c4d6509aa45888496b1e02
commit
{% endhighlight %}

### 查看一个Commit的具体信息

{% highlight bash %}
megrez@MegrezAir  ~/Code/project/whosv/whosv-rails   feature/influxdb  git cat-file commit 5575dbb05f40d04553c4d6509aa45888496b1e02
tree c47cf7949a582175b997cf098c56f14b93b75b05
parent 794f2d3c5f90d1c319be4d1b18aeec83d2cbd2ab
author Halsey <halsey@whosv.com> 1420718036 +0800
committer Halsey <halsey@whosv.com> 1420718036 +0800

更新china_sms
{% endhighlight %}

### 查看Commit树

{% highlight bash %}
megrez@MegrezAir  ~/Code/project/whosv/whosv-rails   feature/influxdb  git ls-tree c47cf7949a582175b997cf098c56f14b93b75b05
100644 blob 98ba0ce4ccdeca9deb945d810127d89bd4983e2b	.gitignore
100644 blob 9464f96c914baf95b5413a61b353d31e2e88d958	.rspec
100644 blob 04d3b9bc18c34f9ed2907119e8e9371222ad56e2	Capfile
100644 blob 8f021325f150ada2c8a83a0e58689d90a1cf0019	Gemfile
100644 blob c954928ca28efe4c356696fbbefeaa61380b3c7d	Gemfile.lock
100644 blob acd108120bb708c4ae27f52a1103e3f8b81de8fa	Guardfile
100644 blob dd4e97e22e159a585b20e21028f964827d5afa4e	README.rdoc
100644 blob ba6b733dd2358d858f00445ebd91c214f0f5d2e5	Rakefile
040000 tree 70e7c95fbf6f520d119b0f0eb395d7db47a9cf72	app
040000 tree af18328492a8433bd83256811b820e0a48f508e8	bin
040000 tree 1efce0cc3cd589776e886ac03383961bffa578d6	client
100644 blob 5bc2a619e83ea182b17e2507c5e0f2f07f7cf18c	config.ru
040000 tree 7b774604290f17817665d12ebcb4eadbd157a17c	config
040000 tree 1e6a474c965b76f2c97c982740bb22a7f87aae37	db
040000 tree 553b1c4c035150b4b33f50ad96977615955714a7	docs
040000 tree c7eed3c387f63861038b19e2bc3d1dec970c7ed3	lib
040000 tree 118a9d61c53f347c6013cc6e9ca84e6cb3261855	public
040000 tree 5a9c00ff0bc5dd0cd6c19191b6595aedd149bc8c	spec
{% endhighlight %}

更加底层的命令可参考:

[更底层的Git](http://gitbook.liuhui998.com/7_6.html)

## HTTP细节

### Git Fetch

首先会向服务器发送请求获取info/refs，即索引，这部分是由第二种info/refs部分完成的，这部分需要遵守git的协议

对于Dumb HTTP，会生成一个info/refs文件，包含所有的tags,branches信息
```
=> GET info/refs
ca82a6dff817ec66f44342007202690a93763949     refs/heads/master
```

具体对于Smart HTTP，客户端请求带一个

```
001e # service=<command> 0000
```

利用command，在fetch的情况下是```git-upload-pack```，可以使用```--advertise-refs --stateless-rpc```，来获取所有的info/refs

{% highlight bash %}
megrez@MegrezAir  ~/Code/project/whosv/whosv-rails   feature/influxdb  git upload-pack --advertise-refs --stateless-rpc ./
00db0d8beadfb19f19ba38371677128e1211e7ed908d HEADmulti_ack thin-pack side-band side-band-64k ofs-delta shallow no-progress include-tag multi_ack_detailed no-done symref=HEAD:refs/heads/feature/influxdb agent=git/2.2.1
00402ea5218c3c5eebe5fa12e294c58e3cafd858b285 refs/heads/develop
00490d8beadfb19f19ba38371677128e1211e7ed908d refs/heads/feature/influxdb
00469e1ea37f22cb60a0c65282fc2ad1cb492a3184c4 refs/heads/feature/ranks
004be8f7bbae896d2dc9b5a6abb56fccabc5decbfa4c refs/heads/feature/usersearch
003fbdc413268e0a90c18d6068a035eb5b07eeb15aaf refs/heads/master
00492d29d5c017562f0a2dfd77b5e1e51d6fdbe88a55 refs/remotes/origin/develop
00520d8beadfb19f19ba38371677128e1211e7ed908d refs/remotes/origin/feature/influxdb
004f2077ab4c85ce94a3366675b01aab6193cff01927 refs/remotes/origin/feature/redis
0048015f337495899adafb3b3ded38ce49ed956a0aa0 refs/remotes/origin/master
00533cfac990a5b8a410bf2511d2674e8567fc2dbd1d refs/remotes/origin/release/whosv-0.1
003d124c9f55343b68e5ccf55914243d69db0cc78944 refs/tags/0.1.0
0040f9d7f8864737136f302211a657e055a28cfb970f refs/tags/0.1.0^{}
003da2751be59e7387d8ffa28cf6fb04467867a21476 refs/tags/0.1.1
004071e7c2dba4a058862a75ce402563bb57c8809b08 refs/tags/0.1.1^{}
003df473b3633d25971910e39b8898b88a1e7a3186d6 refs/tags/0.1.2
004093e3a44643a8dacfccc35a2ca36ab54d9f4067c1 refs/tags/0.1.2^{}
003d387e1d08db0fe33a5039bafd6c2f8578b64346c4 refs/tags/1.0.0
........(此处省略)
0000
{% endhighlight %}

然后获取HEAD，这是由静态部分完成的

```
=> GET HEAD
ref: refs/heads/master
```

既然你知道了HEAD和Head所指向的Commit和Branch，那么你就可以直接请求数据了

首先你需要拿到Commit的信息，然后打开看，再请求一个棵树就搞定了

```
=> GET objects/ca/82a6dff817ec66f44342007202690a93763949
(179 bytes of binary data)

$ git cat-file -p ca82a6dff817ec66f44342007202690a93763949
tree cfda3bf379e4f8dba8717dee55aab78aef7f4daf
parent 085bb3bcb608e1e8451d4b2432f8ecbe6306e7e7
author Scott Chacon <schacon@gmail.com> 1205815931 -0700
committer Scott Chacon <schacon@gmail.com> 1240030591 -0700

changed the version number
```

如果你没拿到某些文件，那么他们可能在Pack文件里面，然后把包扒下来分析一下就好了

```
=> GET objects/info/packs
P pack-816a9b2334da9953e530f27bcac22082a9f5b835.pack

=> GET objects/pack/pack-816a9b2334da9953e530f27bcac22082a9f5b835.idx
(4k of binary data)

=> GET objects/pack/pack-816a9b2334da9953e530f27bcac22082a9f5b835.pack
(13k of binary data)
```

当然在Smart HTTP里面是通过rpc数据调用来实现的

在Fetch的情况下，客户端可能会发送一些例如如下的数据，再由```git upload-pack --stateless-rpc ./``` 返回相应的数据

```
0032want 5a3f6be755bbb7deae50065988cbfa1ffa9ab68a
00000009done
```

这就是我所总结的git fetch的基本过程，基于两种不同的协议

## 其他一些技术

### 获取最新的Commit Hash
{% highlight bash %}
git log | head -1 | cut -d ' ' -f 2
{% endhighlight %}

### 挑选一个Commit打补丁

{% highlight bash %}
git cherry-pick CommitHash
{% endhighlight %}

### 美化显示分支历史记录

{% highlight bash %}
megrez@MegrezAir  ~/Code/project/whosv/whosv-rails   feature/influxdb  brew install tig
==> Downloading http://jonas.nitro.dk/tig/releases/tig-2.0.3.tar.gz
######################################################################## 100.0%
==> Patching
==> ./configure --prefix=/usr/local/Cellar/tig/2.0.3 --sysconfdir=/usr/local/etc
==> make install
==> Caveats
Bash completion has been installed to:
  /usr/local/etc/bash_completion.d
==> Summary
🍺  /usr/local/Cellar/tig/2.0.3: 6 files, 356K, built in 29 seconds

tmegrez@MegrezAir  ~/Code/project/whosv/whosv-rails   feature/influxdb  tig
{% endhighlight %}

![tig](/img/git-plumbing/QQ20150113-1.png)