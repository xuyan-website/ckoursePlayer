# textarea / 输入框"回车换行后最后一行看不见"的优化

这个场景本质是 **"内容高度 ≠ 可视高度"** 和 **"滚动位置不同步"** 两类问题。先对号入座：

| 表现                                     | 根因                                                 |
| :--------------------------------------- | :--------------------------------------------------- |
| 高度不随内容增长，最后一行被裁           | 没做自动增高，或 `scrollHeight` 读错了               |
| 高度长到 `max-height` 后，看不到最新一行 | 出滚动条后没执行 `scrollTop = scrollHeight`          |
| 最后一行贴着下边框/被切掉下半截          | `padding-bottom` 太小，或 `scrollHeight` 没加 border |
| 偶尔正常偶尔被裁                         | 字体未加载完、中文输入法合成期间计算、rAF 时机       |
| 移动端键盘弹起后看不到                   | 没监听 `visualViewport` 变化重算                     |

------

## 一、基础 CSS：先把"容器"写对

css

```
textarea {
  box-sizing: border-box;
  width: 100%;

  padding: 10px 12px;          /* 底部 padding 别省，至少 8px */
  font-size: 14px;
  font-family: inherit;
  line-height: 1.5;            /* 用无单位数值，便于 calc */

  border: 1px solid #d0d0d0;
  border-radius: 6px;

  resize: none;                /* 自动增高时必须关掉手动 resize */
  overflow-y: hidden;          /* 默认隐藏滚动条，到 max-height 再改 auto */

  /* 关键：最小高度 = 1 行 + padding + border */
  min-height: calc(1.5em + 20px + 2px);
  max-height: 200px;           /* 到上限后出滚动条 */

  overflow-wrap: break-word;
  word-break: break-word;
}
```



> `min-height` / `max-height` 里的 `1.5em` 是 `line-height`，`20px` 是上下 padding，`2px` 是上下 border。**三者必须加齐**，少任何一个最后一行都会被压掉 1~2px。

------

## 二、自动增高：核心 JS（把 5 个坑都填上）

js

```
function autoResize(el) {
  // ① 先归零，否则 scrollHeight 读的是旧高度
  el.style.height = 'auto';

  // ② scrollHeight 不含 border，border-box 下要补上
  const borderY = el.offsetHeight - el.clientHeight;

  // ③ 用 scrollHeight 算目标高度
  const target = el.scrollHeight + borderY;

  // ④ 应用高度
  el.style.height = target + 'px';

  // ⑤ 超过 max-height 就出滚动条，并滚到最底让光标可见
  const maxH = parseFloat(getComputedStyle(el).maxHeight);
  if (target >= maxH) {
    el.style.overflowY = 'auto';
    el.scrollTop = el.scrollHeight;
  } else {
    el.style.overflowY = 'hidden';
    el.scrollTop = 0;
  }
}
```



**为什么这几个细节缺一不可：**

- **`height = 'auto'` 归零**：不归零时 `scrollHeight` 永远 ≥ 当前高度，缩不回去，也会多算一行。
- **`+ borderY`**：`scrollHeight` 是内容+padding，不含 border。`border-box` 下 `height` 含 border，差 1~2px 就会把最后一行切半截。
- **`scrollTop = scrollHeight`**：到 `max-height` 出滚动条后，浏览器默认停在顶部，回车后新行在视口外，看起来"被遮挡"。这一行必须有。
- **切回 `overflow: hidden`**：内容缩回去时若还留着 `auto`，会显示一条空滚动条。

------

## 三、调用时机：什么时候触发 `autoResize`

js

```
// 1. 用户输入（含回车）
el.addEventListener('input', () => requestAnimationFrame(() => autoResize(el)));

// 2. 中文输入法：合成期间 input 事件的值不完整，要在 compositionend 后重算
let composing = false;
el.addEventListener('compositionstart', () => composing = true);
el.addEventListener('compositionend', () => {
  composing = false;
  autoResize(el);
});
el.addEventListener('input', () => {
  if (!composing) autoResize(el);
});

// 3. 字体加载完：字体变化会改变换行 → 行数变化
if (document.fonts?.ready) {
  document.fonts.ready.then(() => autoResize(el));
}

// 4. 程序赋值（聊天框回填草稿等）
el.value = 'xxx';
autoResize(el);

// 5. 移动端键盘弹起 / 视口变化
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => autoResize(el));
}
```



**`requestAnimationFrame` 的作用**：`input` 事件触发时，浏览器还没完成重排，直接读 `scrollHeight` 可能拿到旧值。放进下一帧再读最稳。

------

## 四、滚动到底 vs 光标可见（精细场景）

如果用户在中间插字，**不该**强制滚到底。两种策略：

**聊天输入框（永远滚到底）**——就是上面 `scrollTop = scrollHeight`。

**编辑器/表单（只保证光标可见）**：

js

```
function ensureCaretVisible(el) {
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight);
  const caretLine = el.value.slice(0, el.selectionStart).split('\n').length - 1;
  const caretTop = caretLine * lineHeight;
  const caretBottom = caretTop + lineHeight;

  if (caretTop < el.scrollTop) {
    el.scrollTop = caretTop;
  } else if (caretBottom > el.scrollTop + el.clientHeight) {
    el.scrollTop = caretBottom - el.clientHeight;
  }
}
```



------

## 五、`padding-bottom` 的隐藏坑

即使高度算对了，最后一行也可能"贴边被遮"。两个原因：

1. **`scrollHeight` 不含 `border`**——已在第二节补上。
2. **`padding-bottom` 被滚动吞掉**——加 `scroll-padding-bottom`：

css

```
textarea {
  padding-bottom: 12px;
  scroll-padding-bottom: 12px;  /* 滚动定位时把 padding 算进去 */
}
```



如果容器外层还有 `overflow: hidden` 的包裹层，记得留出 1~2px 余量。

------

## 六、移动端：键盘弹起后看不到最后一行

iOS/Android 键盘弹起时，`textarea` 若被 `position: fixed` 或视口高度变化影响，最后一行会跑到键盘下面。解决：

js

```
if (window.visualViewport) {
  const onVVResize = () => {
    // 键盘弹起后重新计算并滚到底
    autoResize(el);
    el.scrollTop = el.scrollHeight;
  };
  window.visualViewport.addEventListener('resize', onVVResize);
  window.visualViewport.addEventListener('scroll', onVVResize);
}
```



同时 `body`/容器避免 `height: 100vh`（用 `100dvh` 或 `visualViewport.height`）。

------

## 七、`resize` 手柄与自动增高冲突

`resize: vertical` 时用户手动拖高度，和自动增高打架。**自动增高场景一律 `resize: none`**，高度交给 JS/内容控制。

------

## 八、最优雅的未来方案：`field-sizing: content`

Chrome 123+ / Safari 18+ 已支持，一行 CSS 搞定自动增高：

css

```
textarea {
  box-sizing: border-box;
  field-sizing: content;        /* 内容多高，框多高 */
  min-height: 2.5em;
  max-height: 200px;
  overflow-y: auto;
  padding: 10px 12px;
  line-height: 1.5;
}
```



配合 `max-height` 到上限自动出滚动条。**兼容性还不够广**，建议作为渐进增强：

css

```
@supports (field-sizing: content) {
  textarea { field-sizing: content; }
}
/* 不支持的浏览器走 JS 自动增高 */
```



------

## 九、一个完整可用的版本（原生 JS）

html

```
<textarea id="ta" rows="1"></textarea>
```



css

```
#ta {
  box-sizing: border-box;
  width: 320px;
  padding: 10px 12px;
  font: 14px/1.5 system-ui, sans-serif;
  border: 1px solid #d0d0d0;
  border-radius: 6px;
  resize: none;
  overflow-y: hidden;
  min-height: calc(1.5em + 20px + 2px);
  max-height: 200px;
  overflow-wrap: break-word;
  scroll-padding-bottom: 10px;
}
```



js

```
const ta = document.getElementById('ta');

function resize() {
  ta.style.height = 'auto';
  const borderY = ta.offsetHeight - ta.clientHeight;
  const h = ta.scrollHeight + borderY;
  ta.style.height = h + 'px';

  const maxH = parseFloat(getComputedStyle(ta).maxHeight);
  if (h >= maxH) {
    ta.style.overflowY = 'auto';
    ta.scrollTop = ta.scrollHeight;   // ← 解决"回车后看不见最后一行"
  } else {
    ta.style.overflowY = 'hidden';
  }
}

let composing = false;
ta.addEventListener('compositionstart', () => composing = true);
ta.addEventListener('compositionend', () => { composing = false; resize(); });
ta.addEventListener('input', () => { if (!composing) requestAnimationFrame(resize); });
document.fonts?.ready.then(resize);
resize();
```



------

## 十、速查清单

1. `box-sizing: border-box` + `line-height` 用无单位数值
2. `min-height` = 行高 + 上下 padding + 上下 border，**三项加齐**
3. `scrollHeight` 读之前先 `height = 'auto'`
4. `scrollHeight` 不含 border，`border-box` 下要 `+ (offsetHeight - clientHeight)`
5. 到 `max-height` 出滚动条后，**必须 `scrollTop = scrollHeight`**
6. `input` 事件放进 `requestAnimationFrame` 再读高度
7. 中文输入法：`compositionend` 后再算
8. `document.fonts.ready` 后再算一次
9. `padding-bottom` + `scroll-padding-bottom` 一起给
10. 移动端监听 `visualViewport.resize`
11. 自动增高时 `resize: none`
12. 新项目可试 `field-sizing: content` 作渐进增强

把这套加上，回车换行后最后一行"被遮挡/看不见"基本就消失了。如果你贴一下现在的 textarea 的 CSS 和 JS 触发逻辑，我可以直接指出是哪一条漏了。