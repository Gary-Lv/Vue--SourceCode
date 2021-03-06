## Vue源码学习

### Vue构造函数初始化的入口文件

> Vue 初始化的入口文件位置：`src/core/instance/index.js`。

### 第一节：Vue初始化

Vue初始化过程（new Vue({options})）这个过程都做了什么？

>1. 处理组件的配置项。
>
>   >* 初始化跟组件时，进行了选项合并工作，将全局配置合并到根组件的局部配置上。
>   >* 初始化每个子组件时候，做了一些性能优化，将组件配置对象上的一些深层次属性放到 vm.$options 选项中，避免原型链的查找，提高代码执行效率。
>
>2. 初始化组件实例的关系属性。例如：$parent、$children、$root、$refs等属性。（ initLifecycle(vm) 方法）。
>
>3. 初始化自定义事件 （ initEvents(vm) 方法）。
>
>4. 初始化插槽，并且定义 this._c（也就是 createElement 方法，就是我们平时使用的 h 函数）。
>
>5. 调用 beforeCreate 钩子函数（ callHook(vm,"beforeCreate") 方法）。
>
>6. 初始化组件的 inject 配置项，得到 `result[key] = val`形式的配置对象，然后将该配置对象进行响应式处理（可以在组件实例内部通过 this 访问），并代理每个 key 到 vm 实例上（ initInjections(vm) 方法）。
>
>7. 响应式处理，处理 props、methods、data、watch、computed等选项（ initState(vm) 方法）。
>
>8. 解析组件配置项上的 provide 对象，并将其挂载到 vm._provided 属性上（ initProvide(vm) 方法）。
>
>9. 调用 created 钩子函数（ callHook(vm,"created") 方法）。
>
>10. 如果发现初始化的配置项上有 el 选项，则自动调用 $mount 方法。如果没有提供 el 属性，则需要在初始化时候手动调用 $mount 方法。
>
>11. 进入挂载阶段。



computed 和 methods 有什么区别？

> 通过阅读源码，可以知道，关键就在内部的 dirty 属性。
>
> 当页面第一次渲染时候，只执行一次 computed 函数，在后续的访问中就不再执行了，直到下一次更新之后（watcher 内部有一个 update 方法，当依赖项发生更改的时候，就会自动触发这个方法，然后将 dirty 置为 true，下一次就会去执行 computed 函数了），才会再次执行。
>
> methods 不一样，他就是一个正常的方法调用，每次调用触发，它都会去执行，不存在缓存。



computed 和 watch 有什么区别？

> 其实两者没有根本的区别，因为内部都是通过 Watcher 构造函数来实现的。
>
> * computed 默认是懒执行，且不可更改。watch 是可以配置的。
> * 使用场景不同，computed 不适用异步，而 watch 适用异步。







































