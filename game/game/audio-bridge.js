/**
 * 游戏音频控制桥接脚本
 * 提供多种方法尝试控制Unity WebGL游戏中的音频
 */

// 跨域通信相关变量
let isConnected = false;
let targetOrigin = "*";  // 理想情况下应该设置为特定域名

// 当前音频状态
let audioState = {
  muted: false,
  volume: 1.0
};

/**
 * 初始化音频桥接
 * @param {string} gameFrameId - iframe的DOM ID
 */
function initAudioBridge(gameFrameId) {
  // 设置消息监听器
  window.addEventListener('message', receiveMessage);
  
  console.log("音频桥接已初始化");
  
  // 如果localStorage中有存储的音频状态，应用它
  const storedMuted = localStorage.getItem('gameSoundOn') === 'false';
  if (storedMuted !== undefined) {
    setGameAudio(!storedMuted);
  }
  
  // 尝试注入控制脚本
  injectAudioControlScript(gameFrameId);
}

/**
 * 将控制脚本注入到游戏iframe中
 */
function injectAudioControlScript(gameFrameId) {
  try {
    const gameFrame = document.getElementById(gameFrameId);
    if (!gameFrame) return;
    
    // 两种方法尝试注入脚本
    // 方法1：使用iframe加载事件
    gameFrame.addEventListener('load', function() {
      setTimeout(() => {
        try {
          injectScriptToIframe(gameFrame);
        } catch (e) {
          console.error("加载后注入失败:", e);
        }
      }, 1000);
    });
    
    // 方法2：如果iframe已经加载完成，立即尝试注入
    if (gameFrame.contentWindow) {
      setTimeout(() => {
        try {
          injectScriptToIframe(gameFrame);
        } catch (e) {
          console.error("直接注入失败:", e);
        }
      }, 2000);
    }
  } catch (e) {
    console.error("注入脚本过程出错:", e);
  }
}

/**
 * 向iframe中注入脚本
 */
function injectScriptToIframe(iframe) {
  try {
    // 先尝试直接访问iframe内容
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    
    // 创建脚本元素
    const script = document.createElement('script');
    script.src = 'audio-bridge-inject.js'; // 使用外部脚本
    script.onload = function() {
      console.log("音频控制脚本成功注入到iframe");
    };
    script.onerror = function(e) {
      console.error("加载注入脚本失败:", e);
      // 回退方法：尝试直接嵌入脚本代码
      injectInlineScript(iframe);
    };
    
    // 添加到iframe的head中
    iframeDoc.head.appendChild(script);
  } catch (e) {
    console.error("无法注入外部脚本:", e);
    
    // 跨域情况下尝试使用srcdoc或sandbox方法
    try {
      // 如果iframe是同域的但加载失败，尝试直接注入代码
      injectInlineScript(iframe);
    } catch (err) {
      console.error("所有注入方法都失败:", err);
    }
  }
}

/**
 * 尝试直接注入脚本代码而不是外部文件
 */
function injectInlineScript(iframe) {
  try {
    const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
    const script = document.createElement('script');
    
    // 基本的音频控制代码
    script.textContent = `
      (function() {
        console.log("内联音频控制脚本已加载");
        
        // 监听来自父页面的音频控制消息
        window.addEventListener('message', function(event) {
          if (event.data && event.data.type === 'audio-control') {
            const muted = !!event.data.muted;
            console.log("收到音频控制:", muted);
            
            // 查找所有音频/视频元素并设置静音
            try {
              const audioElements = document.querySelectorAll('audio, video');
              audioElements.forEach(audio => {
                audio.muted = muted;
              });
              
              // 如果有Unity实例，尝试控制它
              if (window.unityInstance) {
                try {
                  window.unityInstance.SendMessage('AudioManager', 'SetMute', muted);
                } catch (e) {}
              }
              
              // 报告状态回父页面
              window.parent.postMessage({
                type: 'audio-status',
                muted: muted
              }, '*');
            } catch (e) {
              console.error("控制音频失败:", e);
            }
          }
        });
        
        // 通知已准备好
        setTimeout(function() {
          window.parent.postMessage({ type: 'unity-loaded' }, '*');
        }, 1000);
      })();
    `;
    
    iframeDoc.head.appendChild(script);
    console.log("内联音频控制脚本已注入");
  } catch (e) {
    console.error("注入内联脚本失败:", e);
  }
}

/**
 * 接收来自游戏iframe的消息
 */
function receiveMessage(event) {
  // 安全检查 - 在生产环境中应该验证origin
  // if (event.origin !== "https://trusted-game-domain.com") return;
  
  const data = event.data;
  
  // 处理从游戏中发送的消息
  if (typeof data === 'object' && data !== null) {
    if (data.type === 'unity-loaded') {
      console.log("Unity游戏已加载，可以开始通信");
      isConnected = true;
      
      // 立即应用当前的音频状态
      sendAudioStateToGame();
    }
    else if (data.type === 'audio-status') {
      console.log("收到游戏音频状态:", data);
      // 如果需要，可以在这里更新UI
    }
  }
}

/**
 * 设置游戏音频状态
 * @param {boolean} enabled - 是否启用声音
 */
function setGameAudio(enabled) {
  audioState.muted = !enabled;
  localStorage.setItem('gameSoundOn', enabled.toString());
  
  // 尝试发送状态到游戏
  sendAudioStateToGame();
  
  return enabled; // 返回新状态
}

/**
 * 发送音频状态到游戏
 */
function sendAudioStateToGame() {
  const gameFrame = document.getElementById('game-frame');
  if (!gameFrame) {
    console.error("找不到游戏iframe");
    return;
  }
  
  try {
    // 尝试多种方法控制游戏音频
    
    // 方法1: 使用postMessage API
    gameFrame.contentWindow.postMessage({
      type: 'audio-control',
      muted: audioState.muted,
      volume: audioState.volume
    }, targetOrigin);
    
    // 方法2: 尝试直接访问iframe内的音频元素
    tryDirectAudioControl(gameFrame);
    
    // 方法3: 尝试使用Unity特定的API
    tryUnityAudioControl(gameFrame);
    
    console.log(`已尝试设置游戏声音: ${audioState.muted ? '关闭' : '开启'}`);
  } catch (e) {
    console.error("控制游戏音频失败:", e);
  }
}

/**
 * 尝试直接控制iframe中的音频元素
 */
function tryDirectAudioControl(gameFrame) {
  try {
    const iframeDoc = gameFrame.contentDocument || gameFrame.contentWindow.document;
    
    // 查找所有音频和视频元素
    const audioElements = iframeDoc.querySelectorAll('audio, video');
    audioElements.forEach(audio => {
      audio.muted = audioState.muted;
      audio.volume = audioState.volume;
    });
    
    // 查找并控制Web Audio API上下文
    const script = document.createElement('script');
    script.textContent = `
      try {
        // 尝试找到页面上所有的AudioContext实例
        const audioContexts = [];
        for (let key in window) {
          if (window[key] instanceof (window.AudioContext || window.webkitAudioContext)) {
            audioContexts.push(window[key]);
          }
        }
        
        // 控制找到的所有AudioContext
        audioContexts.forEach(ctx => {
          if (ctx.destination) {
            ctx.destination.muted = ${audioState.muted};
            if (ctx.destination.gain) {
              ctx.destination.gain.value = ${audioState.muted ? 0 : audioState.volume};
            }
          }
        });
        
        console.log("已尝试控制Web Audio API:", ${!audioState.muted});
      } catch(e) {
        console.log("Web Audio API控制尝试失败:", e);
      }
    `;
    
    iframeDoc.head.appendChild(script);
    setTimeout(() => {
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    }, 100);
  } catch (e) {
    console.log("直接控制失败，可能是跨域限制:", e);
  }
}

/**
 * 尝试使用Unity特定的API控制音频
 */
function tryUnityAudioControl(gameFrame) {
  try {
    // Unity WebGL特有的API
    if (gameFrame.contentWindow.unityInstance) {
      gameFrame.contentWindow.unityInstance.SendMessage('AudioManager', 'SetMute', audioState.muted);
      gameFrame.contentWindow.unityInstance.SendMessage('AudioManager', 'SetVolume', audioState.volume);
    }
  } catch (e) {
    console.log("Unity API控制尝试失败:", e);
  }
}

// 导出API
window.AudioBridge = {
  init: initAudioBridge,
  setAudio: setGameAudio,
  getState: () => ({ ...audioState })
}; 