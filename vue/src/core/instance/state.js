/* @flow */

import config from "../config";
import Watcher from "../observer/watcher";
import Dep, { pushTarget, popTarget } from "../observer/dep";
import { isUpdatingChildComponent } from "./lifecycle";

import {
  set,
  del,
  observe,
  defineReactive,
  toggleObserving,
} from "../observer/index";

import {
  warn,
  bind,
  noop,
  hasOwn,
  hyphenate,
  isReserved,
  handleError,
  nativeWatch,
  validateProp,
  isPlainObject,
  isServerRendering,
  isReservedAttribute,
  invokeWithErrorHandling,
} from "../util/index";

const sharedPropertyDefinition = {
  enumerable: true,
  configurable: true,
  get: noop,
  set: noop,
};

// 将 key 代理到 Vue 实例上。
export function proxy(target: Object, sourceKey: string, key: string) {
  sharedPropertyDefinition.get = function proxyGetter() {
    // this._props.key
    return this[sourceKey][key];
  };
  sharedPropertyDefinition.set = function proxySetter(val) {
    this[sourceKey][key] = val;
  };
  // 拦截 对 this.key 的访问。
  Object.defineProperty(target, key, sharedPropertyDefinition);
}

// 响应式原理的入口
export function initState(vm: Component) {
  vm._watchers = [];
  const opts = vm.$options;
  if (opts.props) initProps(vm, opts.props);
  if (opts.methods) initMethods(vm, opts.methods);
  if (opts.data) {
    initData(vm);
  } else {
    observe((vm._data = {}), true /* asRootData */);
  }
  if (opts.computed) initComputed(vm, opts.computed);
  // 核心：实例化一个 Watcher ，并返回一个 unwatch
  if (opts.watch && opts.watch !== nativeWatch) {
    initWatch(vm, opts.watch);
  }
}

/**
 * props 对象的处理 做了两件事：
 *  1、对 props 配置对象上的属性做了响应式处理，
 *  2、代理 props 配置对象的属性到 Vue 实例上，支持 this.propsKey 的方式访问。
 * @param {*} vm
 * @param {*} propsOptions
 */
function initProps(vm: Component, propsOptions: Object) {
  const propsData = vm.$options.propsData || {};
  const props = (vm._props = {});
  // cache prop keys so that future props updates can iterate using Array
  // instead of dynamic object key enumeration.
  const keys = (vm.$options._propKeys = []);
  const isRoot = !vm.$parent;
  // root instance props should be converted
  if (!isRoot) {
    toggleObserving(false);
  }
  // 循环遍历 props 对象上的属性
  for (const key in propsOptions) {
    keys.push(key);
    const value = validateProp(key, propsOptions, propsData, vm);
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== "production") {
      const hyphenatedKey = hyphenate(key);
      if (
        isReservedAttribute(hyphenatedKey) ||
        config.isReservedAttr(hyphenatedKey)
      ) {
        warn(
          `"${hyphenatedKey}" is a reserved attribute and cannot be used as component prop.`,
          vm
        );
      }
      defineReactive(props, key, value, () => {
        if (!isRoot && !isUpdatingChildComponent) {
          warn(
            `Avoid mutating a prop directly since the value will be ` +
              `overwritten whenever the parent component re-renders. ` +
              `Instead, use a data or computed property based on the prop's ` +
              `value. Prop being mutated: "${key}"`,
            vm
          );
        }
      });
    } else {
      // 对 props 属性实现响应式
      defineReactive(props, key, value);
    }
    // static props are already proxied on the component's prototype
    // during Vue.extend(). We only need to proxy props defined at
    // instantiation here.
    if (!(key in vm)) {
      // 代理，将 props 的属性代理到 vm 实例上 可以通过 this 直接访问。
      proxy(vm, `_props`, key);
    }
  }
  toggleObserving(true);
}

/**
 * initData 做了三件事：
 * 1、判重处理，data 中的属性 不能和 props 以及 methods 中的属性重复
 * 2、将 data 中的属性代理到 Vue 实例上，可以通过 this.dataKey 的方式访问
 * 3、将 data 中的属性响应式处理。
 * @param {*} vm
 */
function initData(vm: Component) {
  let data = vm.$options.data;
  // 因为每个组件中的 data 属性声明都是一个函数，这里要保证后面处理的 data 是一个对象
  data = vm._data = typeof data === "function" ? getData(data, vm) : data || {};
  if (!isPlainObject(data)) {
    data = {};
    process.env.NODE_ENV !== "production" &&
      warn(
        "data functions should return an object:\n" +
          "https://vuejs.org/v2/guide/components.html#data-Must-Be-a-Function",
        vm
      );
  }
  // proxy data on instance
  const keys = Object.keys(data);
  const props = vm.$options.props;
  const methods = vm.$options.methods;
  let i = keys.length;
  // 判重处理 data 中的属性 不能和 props 以及 methods 中的属性重复
  while (i--) {
    const key = keys[i];
    if (process.env.NODE_ENV !== "production") {
      if (methods && hasOwn(methods, key)) {
        warn(
          `Method "${key}" has already been defined as a data property.`,
          vm
        );
      }
    }
    if (props && hasOwn(props, key)) {
      process.env.NODE_ENV !== "production" &&
        warn(
          `The data property "${key}" is already declared as a prop. ` +
            `Use prop default value instead.`,
          vm
        );
    } else if (!isReserved(key)) {
      // 代理 data 中的属性到 Vue 实例上  支持 this.dataKey 的形式访问
      proxy(vm, `_data`, key);
    }
  }
  // observe data
  // 响应式处理
  observe(data, true /* asRootData */);
}

export function getData(data: Function, vm: Component): any {
  // #7573 disable dep collection when invoking data getters
  pushTarget();
  try {
    return data.call(vm, vm);
  } catch (e) {
    handleError(e, vm, `data()`);
    return {};
  } finally {
    popTarget();
  }
}

const computedWatcherOptions = { lazy: true };

/**
 * computed 是通过 实例化 Watcher 实现的。对每一个 computedKey 都实例化一个 Watcher，默认都是懒执行的。
 * 将 computedKey 代理到 Vue 实例上，支持通过 this.computedKey 的方式去访问
 * @param {Vue 实例}} vm
 * @param {配置} computed
 */
function initComputed(vm: Component, computed: Object) {
  // $flow-disable-line
  const watchers = (vm._computedWatchers = Object.create(null));
  // computed properties are just getters during SSR
  const isSSR = isServerRendering();

  // 遍历 computed 对象上的属性
  // 判断 key 是不是一个函数 如果是函数直接赋值给 getter  如果不是 肯定是一个配置项 里面必须包含 get 这个属性  然后将 get 赋值给 getter
  for (const key in computed) {
    const userDef = computed[key];
    const getter = typeof userDef === "function" ? userDef : userDef.get;
    if (process.env.NODE_ENV !== "production" && getter == null) {
      warn(`Getter is missing for computed property "${key}".`, vm);
    }

    if (!isSSR) {
      // create internal watcher for the computed property.
      // 实例化一个 watcher  所以 computed 其实就是通过 watcher 来实现的。
      watchers[key] = new Watcher(
        vm,
        getter || noop,
        noop,
        computedWatcherOptions
      );
    }

    // component-defined computed properties are already defined on the
    // component prototype. We only need to define computed properties defined
    // at instantiation here.
    if (!(key in vm)) {
      defineComputed(vm, key, userDef);
    } else if (process.env.NODE_ENV !== "production") {
      if (key in vm.$data) {
        warn(`The computed property "${key}" is already defined in data.`, vm);
      } else if (vm.$options.props && key in vm.$options.props) {
        warn(
          `The computed property "${key}" is already defined as a prop.`,
          vm
        );
      } else if (vm.$options.methods && key in vm.$options.methods) {
        warn(
          `The computed property "${key}" is already defined as a method.`,
          vm
        );
      }
    }
  }
}

export function defineComputed(
  target: any,
  key: string,
  userDef: Object | Function
) {
  const shouldCache = !isServerRendering();
  if (typeof userDef === "function") {
    sharedPropertyDefinition.get = shouldCache
      ? createComputedGetter(key)
      : createGetterInvoker(userDef);
    sharedPropertyDefinition.set = noop;
  } else {
    sharedPropertyDefinition.get = userDef.get
      ? shouldCache && userDef.cache !== false
        ? createComputedGetter(key)
        : createGetterInvoker(userDef.get)
      : noop;
    sharedPropertyDefinition.set = userDef.set || noop;
  }
  if (
    process.env.NODE_ENV !== "production" &&
    sharedPropertyDefinition.set === noop
  ) {
    sharedPropertyDefinition.set = function () {
      warn(
        `Computed property "${key}" was assigned to but it has no setter.`,
        this
      );
    };
  }
  // 将 computed 配置项中的 key 代理到 Vue 实例上，支持通过 this.computedKey 的方式访问 computed 上的属性。
  Object.defineProperty(target, key, sharedPropertyDefinition);
}

function createComputedGetter(key) {
  return function computedGetter() {
    // 拿到 watcher
    const watcher = this._computedWatchers && this._computedWatchers[key];
    if (watcher) {
      if (watcher.dirty) {
        // 执行 watcher.evaluate 方法。
        // 做了两件事情：
        //  1、执行watcher.evaluate 内部 相当于执行了 computed.key （函数） 将执行结果赋值给 watcher.value
        //  2、将watcher.dirty 置为 false
        watcher.evaluate();
      }
      if (Dep.target) {
        watcher.depend();
      }
      return watcher.value;
    }
  };
}

function createGetterInvoker(fn) {
  return function computedGetter() {
    return fn.call(this, this);
  };
}

/**
 * methods 对象的处理 做了两件事：
 * 1、判重，methods 对象中的属性不能和 props 对象上的属性重名，如果重复，就以 props 上的属性为准，props 的优先级高于 methods。
 * 2、将 methods 对象上的方法 绑定到 Vue 实例上，可以通过 this.methodsKey 的方式访问。
 * @param {*} vm
 * @param {*} methods
 */
function initMethods(vm: Component, methods: Object) {
  // 首先拿到实例上的 props 对象
  const props = vm.$options.props;
  // 判重处理，判断 methods 上的属性（方法）名字 是否和 props 对象上的属性重名，如果重名 就以 props 的属性为准（props 属性名优先级比 methods 高）
  for (const key in methods) {
    if (process.env.NODE_ENV !== "production") {
      if (typeof methods[key] !== "function") {
        warn(
          `Method "${key}" has type "${typeof methods[
            key
          ]}" in the component definition. ` +
            `Did you reference the function correctly?`,
          vm
        );
      }
      if (props && hasOwn(props, key)) {
        warn(`Method "${key}" has already been defined as a prop.`, vm);
      }
      if (key in vm && isReserved(key)) {
        warn(
          `Method "${key}" conflicts with an existing Vue instance method. ` +
            `Avoid defining component methods that start with _ or $.`
        );
      }
    }
    // 将 methods 上的所有方法赋值到 Vue 实例上，从而实现 this.methodKey 的形式访问。
    vm[key] =
      typeof methods[key] !== "function" ? noop : bind(methods[key], vm);
  }
}

/**
 *
 * @param {Vue 实例} vm
 * @param {配置项} watch
 */
function initWatch(vm: Component, watch: Object) {
  // 循环处理 watch 的每一项
  for (const key in watch) {
    const handler = watch[key];
    // watch 监听配置可能是一个数组  这里就循环处理数组
    if (Array.isArray(handler)) {
      for (let i = 0; i < handler.length; i++) {
        createWatcher(vm, key, handler[i]);
      }
    } else {
      createWatcher(vm, key, handler);
    }
  }
}

function createWatcher(
  vm: Component,
  expOrFn: string | Function,
  handler: any,
  options?: Object
) {
  // 判断 handler 是不是一个对象 如是对象 就去拿到对象里面的 handle 属性的值（也就是一个函数）
  if (isPlainObject(handler)) {
    options = handler;
    handler = handler.handler;
  }
  // 如果 是一个字符串  那就去组件实例上 拿 this.methodsKey 对应的方法
  if (typeof handler === "string") {
    handler = vm[handler];
  }
  // 执行 $watch 方法
  return vm.$watch(expOrFn, handler, options);
}

export function stateMixin(Vue: Class<Component>) {
  // flow somehow has problems with directly declared definition object
  // when using Object.defineProperty, so we have to procedurally build up
  // the object here.
  const dataDef = {};
  dataDef.get = function () {
    return this._data;
  };
  const propsDef = {};
  propsDef.get = function () {
    return this._props;
  };
  if (process.env.NODE_ENV !== "production") {
    dataDef.set = function () {
      warn(
        "Avoid replacing instance root $data. " +
          "Use nested data properties instead.",
        this
      );
    };
    propsDef.set = function () {
      warn(`$props is readonly.`, this);
    };
  }
  Object.defineProperty(Vue.prototype, "$data", dataDef);
  Object.defineProperty(Vue.prototype, "$props", propsDef);

  Vue.prototype.$set = set;
  Vue.prototype.$delete = del;

  Vue.prototype.$watch = function (
    expOrFn: string | Function,
    cb: any,
    options?: Object
  ): Function {
    const vm: Component = this;
    // 处理 cb 回调函数 是对象的情况，保证后面处理中的 cb 是一个函数
    if (isPlainObject(cb)) {
      return createWatcher(vm, expOrFn, cb, options);
    }
    options = options || {};
    // 这里标识 这是一个用户 watcher
    options.user = true;
    // 实例化 Watcher
    const watcher = new Watcher(vm, expOrFn, cb, options);
    // 判断用户设置 watch 监听时候 存在 immediate 配置项  则立即执行回调函数
    if (options.immediate) {
      const info = `callback for immediate watcher "${watcher.expression}"`;
      pushTarget();
      invokeWithErrorHandling(cb, vm, [watcher.value], vm, info);
      popTarget();
    }
    return function unwatchFn() {
      watcher.teardown();
    };
  };
}
