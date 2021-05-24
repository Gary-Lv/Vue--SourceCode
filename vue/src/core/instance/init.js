/* @flow */

import config from "../config";
import { initProxy } from "./proxy";
import { initState } from "./state";
import { initRender } from "./render";
import { initEvents } from "./events";
import { mark, measure } from "../util/perf";
import { initLifecycle, callHook } from "./lifecycle";
import { initProvide, initInjections } from "./inject";
import { extend, mergeOptions, formatComponentName } from "../util/index";

let uid = 0;

export function initMixin(Vue: Class<Component>) {
  // 这里就是Vue实例整个初始化的开始
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this;
    // a uid
    // 对Vue实例的一个唯一Id的递增。
    vm._uid = uid++;

    // 对Vue的一个性能度量  开始测试
    // let startTag, endTag
    // /* istanbul ignore if */
    // if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    //   startTag = `vue-perf-start:${vm._uid}`
    //   endTag = `vue-perf-end:${vm._uid}`
    //   mark(startTag)
    // }

    // a flag to avoid this being observed
    vm._isVue = true;
    // 处理组件配置项
    // merge options
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      // 如果是子组件：进行了一个性能优化，减少原型链的查找，提高执行效率
      initInternalComponent(vm, options);
    } else {
      // 跟组件走这里：选项合并，将全局配置选项合并到跟组件的局部配置上
      // 组件选项的合并，其实发生在三个地方：
      //   1、Vue.component(CompName,Comp),这种定义全局组件时候，做了选项合并，合并的 Vue 内置的全局组件和用户自己注册的全局组件，最终会放到全局的 components 选项上。
      //   2、组件内部使用 { components: { xxx } }，组件的局部注册，执行编译器生成的 render 函数时做了选项合并，会合并全局配置项到组件局部配置项上。
      //   3、第三种情况就是这里了，根组件的合并。
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      );
    }
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== "production") {
      initProxy(vm);
    } else {
      vm._renderProxy = vm;
    }
    // expose real self
    vm._self = vm;

    // 重点：整个初始化最重要的部分，也是核心。

    // 组件关系属性的初始化，比如：$parent、$root、$children
    initLifecycle(vm);

    // 初始化自定义事件。
    // 比如组件 <comp @click="handleClick"></comp>,这种在组件上绑定的事件，事件的监听其实都是子组件自己在监听，也就是说谁触发谁监听。
    // 最终编译的结果：触发是通过 this.$emit('click'), 监听是通过 this.$on('click',function handleClick(){})
    initEvents(vm);

    // 初始化插槽，获取 this.$slots, 定义this._c (即：createElement 方法，也就是平时使用的 h 函数)
    initRender(vm);

    // 执行 beforeCreate 生命周期函数 （所有的生命周期函数都是通过 callHook 方法执行的）
    callHook(vm, "beforeCreate");

    // 初始化 inject 选项。 得到 result[key] = val 形式的配置对象，并做响应式处理。
    initInjections(vm); // resolve injections before data/props

    // 响应式原理的核心，处理 props、methods、computed、data、watch 等选项
    initState(vm);

    // 处理 provide 选项。
    initProvide(vm); // resolve provide after data/props

    // 执行 created 生命周期函数
    callHook(vm, "created");

    // 对Vue的一个性能度量  结束测试
    /* istanbul ignore if */
    // if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    //   vm._name = formatComponentName(vm, false)
    //   mark(endTag)
    //   measure(`vue ${vm._name} init`, startTag, endTag)
    // }

    // 如果存在 el 属性 自动执行 $mount
    if (vm.$options.el) {
      vm.$mount(vm.$options.el);
    }
  };
}

// 性能优化，打平配置对象上的属性，减少运行时原型链的查找，提高执行效率。
export function initInternalComponent(
  vm: Component,
  options: InternalComponentOptions
) {
  // 基于构造函数的配置对象 创建vm.$options
  const opts = (vm.$options = Object.create(vm.constructor.options));
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode;
  opts.parent = options.parent;
  opts._parentVnode = parentVnode;

  const vnodeComponentOptions = parentVnode.componentOptions;
  opts.propsData = vnodeComponentOptions.propsData;
  opts._parentListeners = vnodeComponentOptions.listeners;
  opts._renderChildren = vnodeComponentOptions.children;
  opts._componentTag = vnodeComponentOptions.tag;

  // 如果有 render 函数 将其赋值到 vm.$options
  if (options.render) {
    opts.render = options.render;
    opts.staticRenderFns = options.staticRenderFns;
  }
}

// 从构造函数上解析配置项
export function resolveConstructorOptions(Ctor: Class<Component>) {
  // 从实例构造函数上获取options选项
  let options = Ctor.options;
  // 判断有没有基类
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super);
    // 缓存 基类选项
    const cachedSuperOptions = Ctor.superOptions;
    // 说明基类的配置项发生了改变
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions;
      // check if there are any late-modified/attached options (#4976)
      // 找到更改的选项
      const modifiedOptions = resolveModifiedOptions(Ctor);
      // update base extend options
      if (modifiedOptions) {
        // 将更改的选项和extend合并
        extend(Ctor.extendOptions, modifiedOptions);
      }
      // 将新的选项赋值给 options
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions);
      if (options.name) {
        options.components[options.name] = Ctor;
      }
    }
  }
  return options;
}

function resolveModifiedOptions(Ctor: Class<Component>): ?Object {
  let modified;
  const latest = Ctor.options;
  const sealed = Ctor.sealedOptions;
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {};
      modified[key] = latest[key];
    }
  }
  return modified;
}
