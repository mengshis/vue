import model from './model' // v-model
import text from './text' // v-text 将数据解析为纯文本，不能输出真正的html，页面加载时不显示{{}}。渲染时输出
import html from './html' // v-html 
export default {
  model,
  text,
  html
}
