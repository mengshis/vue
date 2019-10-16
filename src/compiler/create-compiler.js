/* @flow */

import { extend } from 'shared/util'
import { detectErrors } from './error-detector'
import { createCompileToFunctionFn } from './to-function'

/**
 * 1、生成最终编译器选项 finalOptions
 * 2、对错误的收集
 * 3、调用 baseCompile 编译模板
 * @param {*} baseCompile 
 */
export function createCompilerCreator (baseCompile: Function): Function {
  return function createCompiler (baseOptions: CompilerOptions) {
    // 组合编译选项，收集错误，根据平台编译器返回编译结果 { ast, render, staticRenderFns}
    function compile (
      template: string,
      options?: CompilerOptions // 提供定制能力的扩展选项
    ): CompiledResult {
      // 通过 Object.create 函数以 baseOptions 为原型创建 finalOptions 常量
      const finalOptions = Object.create(baseOptions)
      const errors = []
      const tips = []

      let warn = (msg, range, tip) => {
        (tip ? tips : errors).push(msg)
      }

      if (options) {
        if (process.env.NODE_ENV !== 'production' && options.outputSourceRange) {
          // $flow-disable-line
          const leadingSpaceLength = template.match(/^\s*/)[0].length

          warn = (msg, range, tip) => {
            const data: WarningMessage = { msg }
            if (range) {
              if (range.start != null) {
                data.start = range.start + leadingSpaceLength
              }
              if (range.end != null) {
                data.end = range.end + leadingSpaceLength
              }
            }
            (tip ? tips : errors).push(data)
          }
        }
        // merge custom modules 合并modules配置
        if (options.modules) {
          finalOptions.modules =
            (baseOptions.modules || []).concat(options.modules)
        }
        // merge custom directives 合并指令配置
        if (options.directives) {
          finalOptions.directives = extend(
            Object.create(baseOptions.directives || null),
            options.directives
          )
        }
        // copy other options 其余配置选项直接复制
        for (const key in options) {
          if (key !== 'modules' && key !== 'directives') {
            finalOptions[key] = options[key]
          }
        }
      }

      finalOptions.warn = warn
      // 委托baseCompile完成模板编译
      const compiled = baseCompile(template.trim(), finalOptions)
      // compiled: baseCompile对模板的编译结果，包含模板编译后的抽象语法树ast
      /**
        {
          ast,
          render: code.render,
          staticRenderFns: code.staticRenderFns
        }
       */
      if (process.env.NODE_ENV !== 'production') {
        // 通过抽象语法树检查模板中是否存在错误表达式
        detectErrors(compiled.ast, warn)
      }
      // 收集错误和提示
      compiled.errors = errors
      compiled.tips = tips
      return compiled
    }

    return {
      compile,
      compileToFunctions: createCompileToFunctionFn(compile)
    }
  }
}
