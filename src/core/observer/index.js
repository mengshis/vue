/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    this.dep = new Dep()        // 订阅器
    this.vmCount = 0
    // 给value添加__ob__属性，值就是本Observer对象，value.__ob__ = this;
    // Vue.$data 中每个对象都有 __ob__ 属性,包括 Vue.$data对象本身
    // def就是defineProperty的封装，定义一个不可枚举属性__ob__，以防止被枚举
    // 经过def函数后，data会变成如下对象：
    /**
     * {
          a: 1,
          // __ob__ 是不可枚举的属性
          __ob__: {
            value: data, // value 属性指向 data 数据对象本身，这是一个循环引用
            dep: dep实例对象, // new Dep()
            vmCount: 0
          }
        }
     */
    def(value, '__ob__', this)
    // 判断是否为数组，不是的话调用walk()添加getter和setter
    // 如果是数组，调用observeArray()遍历数组，为数组内每个对象添加getter和setter
    if (Array.isArray(value)) {
      if (hasProto) {
        /**
         * 如果该数组属性有原型，则将数组原型方法赋予数组类型的属性
         */
        protoAugment(value, arrayMethods)
      } else {
        /**
         * 如果没有原型，则赋予自身拥有的数组类型的属性
         */
        copyAugment(value, arrayMethods, arrayKeys)
      }
      /**
       * 
       */
      this.observeArray(value)
    } else {
      /**
       * 当值不为数组时，执行walk方法遍历value中的属性，使用Object.defineProperty方法让这些属性变成响应式
       */
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      // 对data对象内的每一个属性进行响应式化
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
export function observe (value: any, asRootData: ?boolean): Observer | void {
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  let ob: Observer | void

  // __ob__这个属性可以认为是用来判断该属性是否被观察，
  // 以免重复观察同一个属性
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    // shouldObserver
    shouldObserve &&
    // isServerRendering 只有当不是服务端渲染的时候才会观测数据
    !isServerRendering() &&
    // 当数据对象是数组或纯对象的时候，才有必要对其进行观测
    (Array.isArray(value) || isPlainObject(value)) &&
    // 对象必须是可扩展属性的
    Object.isExtensible(value) &&
    // 避免Vue实例对象被观测
    !value._isVue
  ) {
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    // 当该对象属性描述无法被改变或别删除时直接返回
    return
  }

  // cater for pre-defined getter/setters
  // 获取已经有的getter和setter
  const getter = property && property.get
  const setter = property && property.set
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // 如果该属性是一个拥有其他属性的对象，那么对其属性也进行观测（响应式化）
  let childOb = !shallow && observe(val)
  // 在此处重写get和set方法
  // 在get中使用depend方法将当前属性添加到当前全局watcher观察者列表中
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      const value = getter ? getter.call(obj) : val
      // Dep.target 全局变量指向的就是当前正在解析指令的Complie生成的 Watcher
      // 会执行到 dep.addSub(Dep.target), 将 Watcher 添加到 Dep 对象的 Watcher 列表中
      if (Dep.target) {
        dep.depend()
        if (childOb) {
          // 对其子属性也进行依赖收集
          // 这样当使用Vue.set给该属性添加新的子属性时，就能够触发依赖
          childOb.dep.depend()
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      // 先取得该属性原来的值
      const value = getter ? getter.call(obj) : val
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        // 新旧值相等或者新值和旧值为NaN时直接返回不触发更新
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      // 设置新的属性值
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      /**
       * 如果当前属性不是对象，则变成一个响应式对象
       */
      childOb = !shallow && observe(newVal)
      // 如果触发set方法，即进行notify通知
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 * 由于给响应式对象添加新的属性不会触发setter，直接根据索引设置数组的值和改变数组长度也无法触发setter，所以vue提供了Vue.set方法
 * 首先将该属性变为响应式，然后notify触发依赖
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  if (!ob) {
    target[key] = val
    return val
  }
  defineReactive(ob.value, key, val)
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
