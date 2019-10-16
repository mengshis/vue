/* @flow */
/**
 * 编译器所包含的概念很多，
 * 比如 词法分析(lexical analysis)，句法分析(parsing)，类型检查/推导，代码优化，代码生成...等等，
 * parser 就是编译器中的一部分，准确的说，parser 是编译器对源代码处理的第一步。
 * parser 是把某种特定格式的文本转换成某种数据结构的程序，
 * 其中“特定格式的文本”可以理解为普通的字符串，
 * 而 parser 的作用就是将这个字符串转换成一种数据结构(通常是一个对象)，
 * 并且这个数据结构是编译器能够理解的，
 * 因为编译器的后续步骤，
 * 比如上面提到的 句法分析，类型检查/推导，代码优化，代码生成 等等都依赖于该数据结构，
 * 正因如此我们才说 parser 是编译器处理源代码的第一步，
 * 并且这种数据结构是抽象的，我们常称其为抽象语法树，即 AST。
 * 
 * Vue的编译大致分成三个阶段：词法分析、句法分析、代码生成
 * 词法分析：字符串模板 => token
 * 句法分析：token => ast
 * 代码生成：ast => 代码生成
 */ 
import { parse } from './parser/index' // 模板解析；template => ast
import { optimize } from './optimizer'
import { generate } from './codegen/index'
import { createCompilerCreator } from './create-compiler'

// `createCompilerCreator` allows creating compilers that use alternative
// parser/optimizer/codegen, e.g the SSR optimizing compiler.
// Here we just export a default compiler using the default parts.
// 提供baseCompile方法，并传入createCompilerCreator创建编译器
// 构建自己的编译器函数供外部使用
export function myCompiler (template: string, options: CompilerOptions) {
  const ast = parse(template.trim(), options)
  // otherGenerate: 根据ast生成其他平台下的运行代码
  const code = otherGenerate(ast, options)
  // ....
  return code
}

// 创建web平台下的编译器
export const createCompiler = createCompilerCreator(function baseCompile (
  template: string,
  options: CompilerOptions
): CompiledResult {
  /**
   * 调用parse将模板解析成ast
   */
  const ast = parse(template.trim(), options)
  if (options.optimize !== false) {
    // 标记静态节点
    optimize(ast, options)
  }
  // 根据给定的AST生成目标平台的代码
  const code = generate(ast, options)
  return {
    ast,
    render: code.render,
    staticRenderFns: code.staticRenderFns
  }
})
