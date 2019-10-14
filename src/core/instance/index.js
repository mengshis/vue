import { initMixin } from './init'
import { stateMixin } from './state'
import { renderMixin } from './render'
import { eventsMixin } from './events'
import { lifecycleMixin } from './lifecycle'
import { warn } from '../util/index'

function Vue (options) {
  if (process.env.NODE_ENV !== 'production' &&
    !(this instanceof Vue)
  ) {
    warn('Vue is a constructor and should be called with the `new` keyword')
  }
  this._init(options)
}

initMixin(Vue)      // 初始化传入Vue构造函数的options
stateMixin(Vue)     // 初始化Vue实例上绑定的data
eventsMixin(Vue)
lifecycleMixin(Vue)
renderMixin(Vue)

export default Vue
