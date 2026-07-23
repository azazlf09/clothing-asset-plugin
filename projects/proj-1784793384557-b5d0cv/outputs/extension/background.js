// Service worker：右键菜单取图、开关侧边栏、快捷键、取图消息中转、页面悬浮按钮唤起
const PANEL = "sidepanel.html";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "clo-reason-image",
    title: "反推此服装并保存到资产库",
    contexts: ["image"],
  });
  // 点击扩展图标即打开侧边栏
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});
// 冷启动也确保行为已设置（onInstalled 只在安装/更新时触发）
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});

// 统一打开侧边栏（尽量在 user gesture 同步链路内调用）
async function openPanel(tabId, windowId) {
  try {
    if (tabId != null) return await chrome.sidePanel.open({ tabId });
  } catch (e) {}
  try {
    if (windowId != null) return await chrome.sidePanel.open({ windowId });
  } catch (e) {}
}

// 右键图片：暂存 srcUrl，打开侧边栏，侧边栏读取后自动加载
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== "clo-reason-image" || !info.srcUrl) return;
  await chrome.storage.session.set({
    pendingImage: { srcUrl: info.srcUrl, pageUrl: info.pageUrl || (tab && tab.url) || "", ts: Date.now() },
  });
  if (tab && tab.id != null) openPanel(tab.id, tab.windowId);
});

// 快捷键：打开侧边栏（Chrome 无程序化 close，快捷键仅负责唤起）
chrome.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "toggle-panel") return;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab) await openPanel(tab.id, tab.windowId);
});

// 统一消息处理
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  // 页面悬浮按钮 / hover 反推框点击唤起侧边栏（sender.tab 同步可得，保住 user gesture）
  if (msg.type === "open-panel") {
    const tab = sender && sender.tab;
    if (tab && tab.id != null) {
      chrome.sidePanel
        .open({ tabId: tab.id })
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
    } else {
      sendResponse({ ok: false, error: "无来源标签页" });
    }
    return true;
  }

  // 侧边栏「从页面选图」：激活点选模式
  if (msg.type === "start-pick") {
    (async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab || tab.id == null) return sendResponse({ ok: false, error: "无活动标签页" });
      try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ["content.js"] });
        await chrome.tabs.sendMessage(tab.id, { type: "pick-mode-on" });
        sendResponse({ ok: true });
      } catch (e) {
        sendResponse({ ok: false, error: String(e.message || e) });
      }
    })();
    return true;
  }

  // content.js 取到图后：暂存供侧边栏消费；open=true 时顺带打开侧边栏（hover 反推框）
  if (msg.type === "picked-image") {
    chrome.storage.session.set({
      pendingImage: { dataUrl: msg.dataUrl, srcUrl: msg.srcUrl, pageUrl: msg.pageUrl, ts: Date.now() },
    });
    if (msg.open && sender && sender.tab && sender.tab.id != null) {
      chrome.sidePanel
        .open({ tabId: sender.tab.id })
        .then(() => sendResponse({ ok: true }))
        .catch((e) => sendResponse({ ok: false, error: String((e && e.message) || e) }));
      return true;
    }
    sendResponse && sendResponse({ ok: true });
  }
});
