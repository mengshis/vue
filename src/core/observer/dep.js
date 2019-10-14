/* @flow */

import type Watcher from './watcher'
import { remove } from '../util/index'
import config from '../config'

let uid = 0

/**
 * A dep is an observable that can have multiple
 * directives subscribing to it.
 * 为什么要有Dep？
 * 不是所有在data上的数据都会被渲染，dep是用来在首次渲染时将所用到的所有属性依赖收集起来
 * 
 * Dep就是dependence的缩写，
 * 在模板中的{{ a + b }}依赖了实例data上的a和b属性，a和b在有任何变化时都会引起视图的变化，
 * 这是因为其实a和b依赖了data中a属性和b属性闭包里面的dep实例
 */
export default class Dep {
  // 静态变量，全局唯一Watcher，因为同一时间只有一个Watcher进行计算
  static target: ?Watcher;
  id: number;
  subs: Array<Watcher>;

  constructor () {
    // subs属性用来存放了订阅它的观察者
    this.id = uid++
    this.subs = []
  }

  addSub (sub: Watcher) {
    // 添加订阅者
    this.subs.push(sub)
  }

  removeSub (sub: Watcher) {
    // 移除订阅者
    remove(this.subs, sub)
  }

  depend () {
    /**
     * 在当前Watcher下，将当前的属性依赖添加观察者到观察者列表中
     */
    if (Dep.target) {
      Dep.target.addDep(this)
    }
  }

  notify () {
    // stabilize the subscriber list first
    const subs = this.subs.slice()
    if (process.env.NODE_ENV !== 'production' && !config.async) {
      // subs aren't sorted in scheduler if not running async
      // we need to sort them now to make sure they fire in correct
      // order
      subs.sort((a, b) => a.id - b.id)
    }

    /**
     * 遍历每一个属性的Watcher，调用其update方法进行属性值的更新
     */
    for (let i = 0, l = subs.length; i < l; i++) {
      subs[i].update()
    }
  }
}

// The current target watcher being evaluated.
// This is globally unique because only one watcher
// can be evaluated at a time.
Dep.target = null
const targetStack = []

export function pushTarget (target: ?Watcher) {
  /**
   * target栈，当某个组件到了某个生命周期的hook执行时，例如mountComponent，
   * 会将当前的watcher压到target栈中
   */
  targetStack.push(target)
  Dep.target = target
}

export function popTarget () {
  targetStack.pop()
  Dep.target = targetStack[targetStack.length - 1]
}
