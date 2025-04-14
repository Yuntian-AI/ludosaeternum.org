/**
 * 音频桥接注入脚本 - 用于在Unity WebGL游戏中拦截和控制音频
 * 
 * 此脚本设计用于直接注入到iframe中，可以访问Unity游戏的内部JavaScript
 */

(function() {
  console.log("音频桥接注入脚本已加载");
  
  // 存储原始的AudioContext创建方法
  const originalAudioContext = window.AudioContext || window.webkitAudioContext;
  const originalCreateAudioContext = originalAudioContext;
  
  // 音频状态
  let audioState = {
    muted: false,
    volume: 1.0
  };
  
  // 跟踪所有创建的AudioContext
  const audioContexts = [];
  
  // 拦截AudioContext创建
  function AudioContextWrapper() {
    // 创建真实的AudioContext
    const realContext = new originalCreateAudioContext();
    
    // 存储以便后续控制
    audioContexts.push(realContext);
    
    // 应用当前音频状态
    applyAudioState(realContext);
    
    console.log("已拦截新的AudioContext创建");
    
    return realContext;
  }
  
  // 保持原型链正确
  AudioContextWrapper.prototype = originalAudioContext.prototype;
  
  // 替换全局的AudioContext
  try {
    window.AudioContext = AudioContextWrapper;
    if (window.webkitAudioContext) {
      window.webkitAudioContext = AudioContextWrapper;
    }
  } catch (e) {
    console.error("无法替换AudioContext:", e);
  }
  
  // 拦截创建音频元素
  const originalCreateElement = document.createElement;
  document.createElement = function(tagName) {
    const element = originalCreateElement.call(document, tagName);
    
    // 如果是音频或视频元素，拦截它
    if (tagName.toLowerCase() === 'audio' || tagName.toLowerCase() === 'video') {
      // 拦截play方法
      const originalPlay = element.play;
      element.play = function() {
        if (audioState.muted) {
          element.muted = true;
        }
        element.volume = audioState.muted ? 0 : audioState.volume;
        return originalPlay.apply(this, arguments);
      };
      
      // 直接设置属性
      element.muted = audioState.muted;
      element.volume = audioState.muted ? 0 : audioState.volume;
      
      console.log(`拦截了${tagName}元素创建`);
    }
    
    return element;
  };
  
  // 应用音频状态到AudioContext
  function applyAudioState(context) {
    try {
      if (context && context.destination) {
        if (context.destination.mute !== undefined) {
          context.destination.mute = audioState.muted;
        }
        
        if (context.destination.gain && context.destination.gain.value !== undefined) {
          context.destination.gain.value = audioState.muted ? 0 : audioState.volume;
        }
      }
    } catch (e) {
      console.log("无法设置AudioContext状态:", e);
    }
  }
  
  // 应用音频状态到所有AudioContext
  function applyAudioStateToAll() {
    // 应用到所有已创建的AudioContext
    audioContexts.forEach(ctx => applyAudioState(ctx));
    
    // 应用到所有音频和视频元素
    const audioElements = document.querySelectorAll('audio, video');
    audioElements.forEach(audio => {
      audio.muted = audioState.muted;
      audio.volume = audioState.muted ? 0 : audioState.volume;
    });
    
    // 如果存在Unity实例，尝试控制它
    if (window.unityInstance) {
      try {
        window.unityInstance.SendMessage('AudioManager', 'SetMute', audioState.muted);
        window.unityInstance.SendMessage('AudioManager', 'SetVolume', audioState.volume);
      } catch (e) {
        console.log("Unity音频控制失败:", e);
      }
    }
    
    // 通知父页面当前状态
    try {
      window.parent.postMessage({
        type: 'audio-status',
        muted: audioState.muted,
        volume: audioState.volume
      }, '*');
    } catch (e) {
      console.log("无法发送状态到父页面:", e);
    }
  }
  
  // 监听来自父页面的消息
  window.addEventListener('message', function(event) {
    // 处理音频控制消息
    if (event.data && event.data.type === 'audio-control') {
      audioState.muted = !!event.data.muted;
      
      if (typeof event.data.volume === 'number') {
        audioState.volume = Math.max(0, Math.min(1, event.data.volume));
      }
      
      console.log(`收到音频控制: muted=${audioState.muted}, volume=${audioState.volume}`);
      applyAudioStateToAll();
    }
  });
  
  // 发送已加载通知
  setTimeout(function() {
    try {
      // 通知父页面脚本已加载
      window.parent.postMessage({
        type: 'unity-loaded',
        status: 'ready'
      }, '*');
      
      console.log("已通知父页面脚本加载完成");
    } catch (e) {
      console.log("无法发送加载通知:", e);
    }
  }, 1000);
  
  // 暴露全局API供Unity游戏使用
  window.GameAudioControl = {
    setMuted: function(muted) {
      audioState.muted = !!muted;
      applyAudioStateToAll();
    },
    setVolume: function(volume) {
      audioState.volume = Math.max(0, Math.min(1, volume));
      applyAudioStateToAll();
    },
    getMuted: function() {
      return audioState.muted;
    },
    getVolume: function() {
      return audioState.volume;
    }
  };
  
  console.log("音频桥接注入脚本初始化完成");
})(); 