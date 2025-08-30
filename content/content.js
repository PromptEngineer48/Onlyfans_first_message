const MODE = 'live'; // Change to 'live' for processing all chats
// const MODE = 'test'; // Change to 'live' for processing all chats

testerURL = 'https://onlyfans.com/my/chats/chat/133936482/'

// use test for testing and live for processing all chats

const N8N_WEBHOOK_URL = MODE === 'test'
? 'http://13.220.101.79:5678/webhook-test/5dc78ea0-704a-467e-8a9c-63518c8d7c86'
: 'http://13.220.101.79:5678/webhook/5dc78ea0-704a-467e-8a9c-63518c8d7c86';
  

// Global flag to indicate whether the extension should stop all activity
let GLOBAL_EMERGENCY_STOP = false;

// Global state to track interruptible processing
let isCurrentlyProcessing = false;
let currentProcessingIndex = 0;
let allChatUrls = [];
let processingPaused = false;

// Initialize main content script
let popupAlreadyDisplayed = false; // Track if popup has been shown

// Clear any previously stored email at startup
try {
    // We're not removing these values - we're just logging that we found them
    // This helps with debugging to see if values exist at startup
    const existingEmail = localStorage.getItem('of_user_email');
    const existingUserId = localStorage.getItem('of_user_id');
    
    if (existingEmail || existingUserId) {
        console.log('[OF Assistant] Found stored user info at startup:', { 
            email: existingEmail, 
            userId: existingUserId 
        });
    }
} catch (e) {
    console.error('[OF Assistant] Error checking localStorage at startup:', e);
}

// New function to handle core chats page initialization logic
function initializeChatsPageLogic() {
    console.log('[OF Assistant] initializeChatsPageLogic called');

    // Check if we are on the chats page first
    if (!isChatsPage()) {
        console.log('[OF Assistant] Not on chats page. Skipping chats page initialization logic.');
        return;
    }

    console.log('[OF Assistant] On chats page.');

    // Check the restart flag BEFORE anything else
    const restartScan = localStorage.getItem('of_scan_complete_restart');
    console.log('[OF Assistant] Checking restart flag. Value:', restartScan);

    if (restartScan === 'true') {
        localStorage.removeItem('of_scan_complete_restart'); // Clear the flag immediately
        console.log('[OF Assistant] Restart flag detected. Bypalling popup and restarting scan...');

        // Ensure popup is marked as displayed to prevent it later in this session
        popupAlreadyDisplayed = true;

        // Directly start the scan if in live mode
        if (MODE === 'live') {
            // Add a small delay to allow page elements to settle
            setTimeout(() => {
                console.log('[OF Assistant] Initiating autoScrollChatListAndGetLinks after delay...');
                autoScrollChatListAndGetLinks();
            }, 1000); // Increased delay to 1 second
        } else {
            console.log('[OF Assistant] Restart flag detected but MODE is not live. Not restarting scan automatically.');
        }

        // Stop execution here as we are handling the restart
        return;
    }

    // If no restart flag, proceed with standard initialization (show popup if not already shown)
    console.log('[OF Assistant] No restart flag found. Proceeding with standard initialization.');
    console.log('[OF Assistant] Checking popup state. popupAlreadyDisplayed:', popupAlreadyDisplayed);
    
    if (!popupAlreadyDisplayed) {
        console.log('[OF Assistant] On main chats page - activating popup');
        popupAlreadyDisplayed = true; // Mark as displayed *before* creating to avoid re-triggering
        createMessagePopup();
    } else {
        console.log('[OF Assistant] On chats page, no restart flag, and popup already displayed. Doing nothing.');
    }
}

document.addEventListener('DOMContentLoaded', function() {
    console.log('[OF Assistant] DOMContentLoaded event fired');
    // Call the centralized initialization logic
    initializeChatsPageLogic();
});

// Initialize (This runs when the script is first injected)
// Call the centralized initialization logic here as well
if (isChatsPage()) {
    console.log('[OF Assistant] Script initialized on chats page');
    // Add a small delay before calling the initialization logic on script injection
    // This gives the page a moment to start loading before our script makes decisions
    setTimeout(() => {
        initializeChatsPageLogic();
    }, 500); // 500ms delay on initial script load
}

// Function to start the main interruptible processing
function startSequentialProcessing() {
    isCurrentlyProcessing = true;
    
    // Get the current index from localStorage (resume from where we left off)
    const savedIndex = localStorage.getItem('of_current_index');
    currentProcessingIndex = savedIndex ? parseInt(savedIndex, 10) : 0;
    
    allChatUrls = JSON.parse(localStorage.getItem('of_chat_urls') || '[]');
    
    console.log(`[OF Assistant] Starting sequential processing: ${allChatUrls.length} chats, starting from index ${currentProcessingIndex}`);
    console.log(`[OF Assistant] MODE: ${MODE}, URLs:`, allChatUrls);
    
    // Start monitoring for new messages (only in live mode)
    if (MODE === 'live') {
        startNewMessageMonitoring();
    } else {
        console.log('[OF Assistant] TEST MODE: Skipping new message monitoring');
    }
    
    // Begin processing
    processNextChat();
}

// Main processing function
function processNextChat() {
    if (!isCurrentlyProcessing || processingPaused) return;
    
    if (currentProcessingIndex >= allChatUrls.length) {
        // All chats processed
        console.log('[OF Assistant] All chats processed successfully!');
        isCurrentlyProcessing = false;
        return;
    }
    
    const currentChatUrl = allChatUrls[currentProcessingIndex];
    console.log(`[OF Assistant] Processing chat ${currentProcessingIndex + 1}/${allChatUrls.length}: ${currentChatUrl}`);
    console.log(`[OF Assistant] Current URL: ${window.location.href}`);
    
    // Check if we're already on the correct chat page
    const currentUrl = window.location.href;
    const expectedChatId = currentChatUrl.split('/').pop().replace(/\/$/, '');
    const isCurrentChatUrl = currentUrl.includes(`/my/chats/chat/${expectedChatId}`) || 
                           currentUrl.includes(`/chats/chat/${expectedChatId}`) ||
                           currentUrl === currentChatUrl;
    
    console.log(`[OF Assistant] Expected chat ID: ${expectedChatId}`);
    console.log(`[OF Assistant] Is current chat URL: ${isCurrentChatUrl}`);
    
    if (isCurrentChatUrl) {
        // We're already on the right page, start extraction
        console.log('[OF Assistant] Already on correct chat page, starting extraction...');
        setTimeout(() => {
            // Start the extraction process
            autoScrollAndExtract(() => {
                onMessageExtractionComplete();
            });
        }, 2000);
    } else {
        // Navigate to current chat
        console.log(`[OF Assistant] Navigating to chat: ${currentChatUrl}`);
        window.location.href = currentChatUrl;
    }
}

// Function to monitor for new messages
function startNewMessageMonitoring() {
    // Check every 15 seconds for new messages
    setInterval(() => {
        if (!isCurrentlyProcessing) return;
        
        const newMessages = detectNewMessages();
        if (newMessages.length > 0) {
            console.log(`[OF Assistant] Interrupting processing for ${newMessages.length} new messages`);
            interruptProcessing(newMessages);
        }
    }, 15000); // 15 seconds
}

// Detect new messages
function detectNewMessages() {
    const newChats = [];
    const chatElements = document.querySelectorAll('a[href*="/my/chats/chat/"]');
    
    chatElements.forEach(chat => {
        // Look for unread indicators
        const unreadBadge = chat.querySelector('[class*="unread"], [class*="badge"], [class*="notification"]');
        if (unreadBadge && !chat.dataset.processed) {
            newChats.push({
                url: chat.href,
                priority: 'high',
                timestamp: Date.now()
            });
            chat.dataset.processed = 'true';
        }
    });
    
    return newChats;
}

// Interrupt current processing for new messages
function interruptProcessing(newMessages) {
    // Pause current processing
    processingPaused = true;
    
    // Store current state
    localStorage.setItem('of_processing_paused', 'true');
    localStorage.setItem('of_current_index', currentProcessingIndex.toString());
    localStorage.setItem('of_new_messages', JSON.stringify(newMessages));
    
    // Process new messages first
    processNewMessages(newMessages);
}

// Process new messages
function processNewMessages(newMessages) {
    console.log(`[OF Assistant] Processing ${newMessages.length} new messages first`);
    
    // Sort by priority (unread first)
    newMessages.sort((a, b) => {
        if (a.priority === 'high' && b.priority !== 'high') return -1;
        if (b.priority === 'high' && a.priority !== 'high') return 1;
        return b.timestamp - a.timestamp; // Newest first
    });
    
    // Process each new message
    let messageIndex = 0;
    
    function processNextNewMessage() {
        if (messageIndex >= newMessages.length) {
            // All new messages processed, resume main processing
            resumeMainProcessing();
            return;
        }
        
        const message = newMessages[messageIndex];
        console.log(`[OF Assistant] Processing new message ${messageIndex + 1}/${newMessages.length}: ${message.url}`);
        
        // Navigate to this chat
        window.location.href = message.url;
        
        // After processing, move to next
        messageIndex++;
        
        // Wait for page load, then continue
        setTimeout(processNextNewMessage, 3000);
    }
    
    processNextNewMessage();
}

// Resume main processing after handling new messages
function resumeMainProcessing() {
    console.log('[OF Assistant] Resuming main processing from index:', currentProcessingIndex);
    
    // Clear new message data
    localStorage.removeItem('of_new_messages');
    localStorage.removeItem('of_processing_paused');
    
    // Resume processing
    processingPaused = false;
    
    // Continue from where we left off
    setTimeout(() => {
        processNextChat();
    }, 2000);
}

// Function to continue processing after chat extraction
function continueAfterExtraction() {
    // Mark current chat as processed
    currentProcessingIndex++;
    localStorage.setItem('of_current_index', currentProcessingIndex.toString());
    
    // Check if we were interrupted
    const wasPaused = localStorage.getItem('of_processing_paused') === 'true';
    
    if (wasPaused) {
        // We were processing new messages, resume main flow
        resumeMainProcessing();
    } else {
        // Continue normal processing
        processNextChat();
    }
}

// Enhanced function to handle extraction completion with proper state management
function onMessageExtractionComplete() {
    try {
        // Get current state from localStorage
        const urls = JSON.parse(localStorage.getItem('of_chat_urls') || '[]');
        const idx = parseInt(localStorage.getItem('of_chat_index') || '0', 10);
        
        // Update the index
        const newIdx = idx + 1;
        localStorage.setItem('of_chat_index', newIdx.toString());
        
        console.log(`[OF Assistant] Extraction complete. Index: ${idx} -> ${newIdx}, Total URLs: ${urls.length}, MODE: ${MODE}`);
        
        if (newIdx < urls.length) {
            // More chats to process
            console.log(`[OF Assistant] Finished extracting chat ${idx + 1} of ${urls.length}. Moving to next chat.`);
            
            // Navigate to next chat
            setTimeout(() => {
                try {
                    console.log(`[OF Assistant] Navigating to next chat: ${urls[newIdx]}`);
                    window.location.href = urls[newIdx];
                } catch (navErr) {
                    console.error('[OF Assistant] Error navigating to next chat:', navErr);
                    // Try to recover by going back to the chat list
                    window.location.href = 'https://onlyfans.com/my/chats';
                }
            }, 2000);
        } else {
            // All chats processed
            try {
                const totalChats = urls.length || 0;
                console.log(`[OF Assistant] ✅ COMPLETED: All ${totalChats} chats have been processed successfully!`);
                
                if (MODE === 'test') {
                    console.log('[OF Assistant] TEST MODE: Test completed successfully!');
                    alert('Test mode completed successfully! Check the console for details.');
                }
                
                // Clean up localStorage
                localStorage.removeItem('of_chat_urls');
                localStorage.removeItem('of_chat_index');
                localStorage.removeItem('of_force_extraction');
                localStorage.setItem('of_scan_complete_restart', 'true');
                
                // Navigate back to the main chats page to trigger a restart
                setTimeout(() => {
                    window.location.href = 'https://onlyfans.com/my/chats';
                }, 5000);
                
            } catch (resetErr) {
                console.error('[OF Assistant] Error resetting state:', resetErr);
            }
        }
    } catch (err) {
        console.error('[OF Assistant] Error in onMessageExtractionComplete:', err);
        // Fallback to chat list
        window.location.href = 'https://onlyfans.com/my/chats';
    }
}

// Function to check if we should start processing on page load
function checkAndStartProcessing() {
    // Check if we have chat URLs and should be processing
    const chatUrls = localStorage.getItem('of_chat_urls');
    const currentIndex = localStorage.getItem('of_current_index');
    
    if (chatUrls && currentIndex !== null) {
        const urls = JSON.parse(chatUrls);
        const idx = parseInt(currentIndex, 10);
        
        if (idx < urls.length) {
            console.log(`[OF Assistant] Found processing state: ${idx + 1}/${urls.length} chats`);
            
            // Check if we're on the correct chat page
            const expectedUrl = urls[idx];
            const currentUrl = window.location.href;
            const expectedChatId = expectedUrl.split('/').pop().replace(/\/$/, '');
            const isCorrectChat = currentUrl.includes(`/my/chats/chat/${expectedChatId}`) || 
                               currentUrl.includes(`/chats/chat/${expectedChatId}`) ||
                               currentUrl === expectedUrl;
            
            if (isCorrectChat) {
                console.log(`[OF Assistant] On correct chat page, starting extraction...`);
                
                // Start extraction after a delay
                setTimeout(() => {
                    autoScrollAndExtract(() => {
                        onMessageExtractionComplete();
                    });
                }, 3000);
            } else {
                console.log(`[OF Assistant] Not on expected chat page, navigating...`);
                window.location.href = expectedUrl;
            }
        }
    }
}

// Add page load event listener for chat pages
if (window.location.href.includes('/my/chats/chat/')) {
    // Wait for page to be fully loaded
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', checkAndStartProcessing);
    } else {
        // Page already loaded
        setTimeout(checkAndStartProcessing, 1000);
    }
}

// Check if we're on the OnlyFans chats page (exact matches only)
function isChatsPage() {
    const url = window.location.href;
    // Only match the exact main chat pages
    return url === 'https://onlyfans.com/my/chats' || 
           url === 'https://onlyfans.com/my/chats/';
}


// Function to create an emergency stop button that stays visible during all operations
function createEmergencyStopButton() {
    // Remove any existing stop button first
    const existingButton = document.getElementById('of-emergency-stop');
    if (existingButton) {
        existingButton.remove();
    }
    
    // Create the emergency stop button
    const stopButton = document.createElement('div');
    stopButton.id = 'of-emergency-stop';
    stopButton.style.position = 'fixed';
    stopButton.style.top = '200px';  // Change from bottom to top
    stopButton.style.left = '20px'; // Change from right to left
    stopButton.style.width = '80px';
    stopButton.style.height = '80px';
    stopButton.style.backgroundColor = 'red';
    stopButton.style.color = 'white';
    stopButton.style.borderRadius = '50%';
    stopButton.style.display = 'flex';
    stopButton.style.justifyContent = 'center';
    stopButton.style.alignItems = 'center';
    stopButton.style.fontWeight = 'bold';
    stopButton.style.fontSize = '16px';
    stopButton.style.boxShadow = '0 4px 15px rgba(0, 0, 0, 0.5)';
    stopButton.style.cursor = 'pointer';
    stopButton.style.zIndex = '9999999';
    stopButton.style.textAlign = 'center';
    stopButton.style.lineHeight = '1.2';
    stopButton.style.border = '3px solid white';
    stopButton.style.animation = 'pulse-red 2s infinite';
    
    // Make button draggable so user can move it if it's in the way
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    
    stopButton.addEventListener('mousedown', function(e) {
        isDragging = true;
        startX = e.clientX - stopButton.getBoundingClientRect().left;
        startY = e.clientY - stopButton.getBoundingClientRect().top;
        
        stopButton.style.cursor = 'grabbing';
        e.preventDefault(); // Prevent text selection during drag
    });
    
    document.addEventListener('mousemove', function(e) {
        if (!isDragging) return;
        
        const newLeft = e.clientX - startX;
        const newTop = e.clientY - startY;
        
        // Keep button within viewport
        const maxX = window.innerWidth - stopButton.offsetWidth;
        const maxY = window.innerHeight - stopButton.offsetHeight;
        
        stopButton.style.left = Math.max(0, Math.min(newLeft, maxX)) + 'px';
        stopButton.style.top = Math.max(0, Math.min(newTop, maxY)) + 'px';
    });
    
    document.addEventListener('mouseup', function() {
        if (isDragging) {
            isDragging = false;
            stopButton.style.cursor = 'pointer';
        }
    });
    
    // Add pulsing animation
    const style = document.createElement('style');
    style.textContent = `
        @keyframes pulse-red {
            0% {
                transform: scale(1);
                box-shadow: 0 0 0 0 rgba(255, 0, 0, 0.7);
            }
            
            70% {
                transform: scale(1.05);
                box-shadow: 0 0 0 10px rgba(255, 0, 0, 0);
            }
            
            100% {
                transform: scale(1);
                box-shadow: 0 0 0 0 rgba(255, 0, 0, 0);
            }
        }
    `;
    document.head.appendChild(style);
    
    stopButton.innerHTML = `<div>
                            <div style="font-size: 24px;">⛔</div>
                            <div>STOP</div>
                            <div style="font-size: 10px; opacity: 0.8; margin-top: 3px;">(drag me)</div>
                          </div>`;
    
    // Add click event to stop all activity
    stopButton.addEventListener('click', function() {
        GLOBAL_EMERGENCY_STOP = true;
        
        // Visual feedback that stop was activated
        stopButton.style.backgroundColor = '#700';
        stopButton.style.animation = 'none';
        stopButton.innerHTML = `<div>
                               <div style="font-size: 24px;">✓</div>
                               <div>STOPPED</div>
                             </div>`;
        
        // Show a notification that everything is stopping
        const stopNotification = document.createElement('div');
        stopNotification.style.position = 'fixed';
        stopNotification.style.top = '50%';
        stopNotification.style.left = '50%';
        stopNotification.style.transform = 'translate(-50%, -50%)';
        stopNotification.style.background = 'rgba(0, 0, 0, 0.9)';
        stopNotification.style.color = 'white';
        stopNotification.style.padding = '30px 40px';
        stopNotification.style.borderRadius = '15px';
        stopNotification.style.zIndex = '9999998';
        stopNotification.style.fontSize = '24px';
        stopNotification.style.fontWeight = 'bold';
        stopNotification.style.boxShadow = '0 0 30px rgba(0, 0, 0, 0.7)';
        stopNotification.style.border = '3px solid red';
        stopNotification.style.textAlign = 'center';
        stopNotification.innerHTML = `<div style="font-size: 48px; margin-bottom: 15px;">🛑</div>
                                    EMERGENCY STOP ACTIVATED<br>
                                    <span style="font-size: 18px; opacity: 0.8; margin-top: 10px; display: block;">All processes have been halted.<br>The page will refresh in 3 seconds.</span>`;
        document.body.appendChild(stopNotification);
        
        // Clear localStorage
        try {
            localStorage.removeItem('of_chat_urls');
            localStorage.removeItem('of_chat_index');
        } catch (e) {
            console.error('[OF Assistant] Error clearing localStorage:', e);
        }
        
        // Cancel any running intervals or timeouts
        const highestTimeoutId = setTimeout(() => {});
        for (let i = 0; i < highestTimeoutId; i++) {
            clearTimeout(i);
        }
        
        // Refresh the page after a short delay to completely reset
        setTimeout(() => {
            window.location.reload();
        }, 3000);
    });
    
    document.body.appendChild(stopButton);
    return stopButton;
}

// Function to check if emergency stop is activated
function checkEmergencyStop() {
    if (GLOBAL_EMERGENCY_STOP) {
        console.log('[OF Assistant] Emergency stop activated - halting operation');
        throw new Error('Emergency stop activated');
    }
}

// Create and show the message popup
function createMessagePopup() {
    // Double-check that we're on the right page and popup hasn't been shown
    if (!isChatsPage() || popupAlreadyDisplayed) {
        console.log('[OF Assistant] Skipping popup creation - wrong page or already shown');
        return;
    }
    
    popupAlreadyDisplayed = true;
    
    const popup = document.createElement('div');
    popup.className = 'of-message-assistant-popup';
    popup.innerHTML = `
        <button id="popup-reset-btn" style="position: absolute; top: 10px; right: 10px; background: #fff; border: none; border-radius: 50%; box-shadow: 0 1px 4px rgba(0,0,0,0.08); width: 28px; height: 28px; cursor: pointer; font-size: 1.1em; color: #00adef; z-index: 10;">⟳</button>
        <div class="message-prompt">
            <div class="bot-icon" style="font-size: 2.5em; margin-bottom: 8px; cursor: move;" id="popup-drag-handle">🤖</div>
            <h3 style="margin: 0 0 8px 0; font-size: 1.2em; color: #00adef; font-weight: bold; cursor: move;" id="popup-drag-title">Give Control to Your Bot</h3>
            <p style="margin: 0 0 16px 0; color: #555; font-size: 0.98em;">Choose how you want to manage your chats:</p>
            <div class="button-row">
                <button class="yes-btn" style="background: #00adef; color: #fff; font-weight: bold; margin-right: 8px;">🤖 Auto Mode</button>
                <button class="no-btn" style="background: #f5f5f5; color: #333; font-weight: bold;">📝 Manual Mode</button>
            </div>
            <button class="clear-data-btn" style="margin-top: 15px; padding: 5px 10px; background: #ff6b6b; color: white; border: none; border-radius: 5px; cursor: pointer; font-size: 0.9em; display: block; width: 100%;">🗑️ Clear Saved Data</button>
        </div>
    `;

    // Add the clear data button functionality
    const clearDataBtn = popup.querySelector('.clear-data-btn');
    clearDataBtn.addEventListener('click', function() {
        try {
            localStorage.removeItem('of_chat_urls');
            localStorage.removeItem('of_chat_index');
            
            // Show confirmation
            const confirmClear = document.createElement('div');
            confirmClear.style.background = '#4CAF50';
            confirmClear.style.color = 'white';
            confirmClear.style.padding = '8px';
            confirmClear.style.textAlign = 'center';
            confirmClear.style.borderRadius = '5px';
            confirmClear.style.marginTop = '10px';
            confirmClear.style.fontSize = '0.9em';
            confirmClear.innerText = 'Data cleared successfully!';
            
            const buttonRow = popup.querySelector('.button-row');
            buttonRow.parentNode.insertBefore(confirmClear, clearDataBtn);
            
            // Remove confirmation after 3 seconds
            setTimeout(() => {
                try {
                    confirmClear.remove();
                } catch (e) {}
            }, 3000);
            
        } catch (e) {
            console.error('[OF Assistant] Error clearing localStorage:', e);
        }
    });

    // Draggable logic
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;

    const dragHandle = popup.querySelector('#popup-drag-handle') || popup.querySelector('#popup-drag-title');
    dragHandle.style.userSelect = 'none';

    dragHandle.addEventListener('mousedown', (e) => {
        isDragging = true;
        const rect = popup.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        document.body.style.userSelect = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (isDragging) {
            popup.style.left = (e.clientX - offsetX) + 'px';
            popup.style.top = (e.clientY - offsetY) + 'px';
            popup.style.right = 'auto';
            popup.style.bottom = 'auto';
            popup.style.position = 'fixed';
        }
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        document.body.style.userSelect = '';
    });

    // Reset button logic
    const resetBtn = popup.querySelector('#popup-reset-btn');
    resetBtn.addEventListener('click', () => {
        popup.style.left = '';
        popup.style.top = '';
        popup.style.right = '20px';
        popup.style.bottom = '20px';
        popup.style.position = 'fixed';
    });

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
        .of-message-assistant-popup {
            position: fixed;
            bottom: 20px;
            right: 20px;
            background: white;
            padding: 22px 24px 18px 24px;
            border-radius: 12px;
            box-shadow: 0 4px 24px rgba(0,0,0,0.13);
            z-index: 1000;
            min-width: 270px;
            max-width: 340px;
            /* Gradient border using a pseudo-element */
            border: 3px solid transparent;
            background-clip: padding-box;
        }
        .of-message-assistant-popup::before {
            content: '';
            position: absolute;
            inset: 0;
            z-index: -1;
            border-radius: 14px;
            padding: 2px;
            background: linear-gradient(135deg, #00adef, #ff6ec4, #f7971e, #00adef 90%);
            -webkit-mask:
                linear-gradient(#fff 0 0) content-box,
                linear-gradient(#fff 0 0);
            -webkit-mask-composite: xor;
            mask-composite: exclude;
        }
        .message-prompt {
            text-align: center;
        }
        .bot-icon {
            margin-bottom: 8px;
        }
        .button-row {
            display: flex;
            justify-content: center;
            gap: 10px;
        }
        .yes-btn, .no-btn {
            margin: 0 2px;
            padding: 10px 18px;
            border: 2px solid #111;
            border-radius: 6px;
            cursor: pointer;
            font-size: 1em;
            transition: background 0.2s, color 0.2s, border-color 0.2s;
        }
        .yes-btn:hover {
            background: #0095cc;
            border-color: #111;
        }
        .no-btn:hover {
            background: #e0e0e0;
            border-color: #111;
        }
    `;
    document.head.appendChild(style);

    // Add event listeners
    popup.querySelector('.yes-btn').addEventListener('click', () => {
        chrome.runtime.sendMessage({ type: 'openPopup' });
        popup.remove();
    });

    popup.querySelector('.no-btn').addEventListener('click', () => {
        popup.remove();
    });

    document.body.appendChild(popup);
}

// Initialize
if (isChatsPage()) {
    // Check if the script should restart scanning automatically (after completing a full cycle)
    const restartScan = localStorage.getItem('of_scan_complete_restart');
    if (restartScan === 'true') {
        localStorage.removeItem('of_scan_complete_restart'); // Clear the flag
        console.log('[OF Assistant] Restart flag detected on initialization. Bypassing popup and restarting scan...');
        // Directly start the scan if in live mode
        if (MODE === 'live') {
            // Add a small delay to allow page elements to settle
            setTimeout(() => {
                console.log('[OF Assistant] Initiating autoScrollChatListAndGetLinks after delay...');
                autoScrollChatListAndGetLinks();
            }, 1000); // 1 second delay
        } else {
            console.log('[OF Assistant] Restart flag detected but MODE is not live. Not restarting scan automatically.');
        }
    } else {
        // Only create popup if no restart flag
        createMessagePopup();
    }
}

// Utility to delay (for navigation/waiting)
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Function to auto-scroll the chat list and extract all chat links
async function autoScrollChatListAndGetLinks() {
    // Create emergency stop button right away
    const stopButton = createEmergencyStopButton();
    
    try {
        // Add a very visible debug overlay that will stay on screen
        const debugOverlay = document.createElement('div');
        debugOverlay.style.position = 'fixed';
        debugOverlay.style.top = '10px';
        debugOverlay.style.left = '10px';
        debugOverlay.style.background = 'rgba(255, 0, 0, 0.9)';
        debugOverlay.style.color = 'white';
        debugOverlay.style.padding = '20px';
        debugOverlay.style.borderRadius = '5px';
        debugOverlay.style.zIndex = '99999999';
        debugOverlay.style.fontSize = '18px';
        debugOverlay.style.fontWeight = 'bold';
        debugOverlay.style.maxWidth = '80%';
        debugOverlay.style.pointerEvents = 'none';
        debugOverlay.innerHTML = 'STARTING ONLYFANS CHAT SCANNER...';
        document.body.appendChild(debugOverlay);
        
        // Check emergency stop
        checkEmergencyStop();
        
        // Verify we're on the correct URL
        if (window.location.href !== 'https://onlyfans.com/my/chats/' &&
            window.location.href !== 'https://onlyfans.com/my/chats') {
            console.log(`[OF Assistant] Wrong URL: ${window.location.href}. Redirecting to /my/chats/`);
            debugOverlay.innerHTML = `WRONG URL: ${window.location.href}<br>REDIRECTING...`;
            // Redirect to the correct URL first
            window.location.href = 'https://onlyfans.com/my/chats/';
            return ['redirect'];
        }
        
        console.log('[OF Assistant] On correct URL, starting scroll operation...');
        debugOverlay.innerHTML = 'CORRECT URL: ' + window.location.href;
        
        // Create main indicator
        const indicator = document.createElement('div');
        indicator.style.position = 'fixed';
        indicator.style.top = '70px';
        indicator.style.right = '20px';
        indicator.style.background = 'rgba(0, 173, 239, 0.9)';
        indicator.style.color = 'white';
        indicator.style.padding = '15px 20px';
        indicator.style.borderRadius = '8px';
        indicator.style.zIndex = '9999999';
        indicator.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
        indicator.style.fontSize = '16px';
        indicator.style.fontWeight = 'bold';
        indicator.style.maxWidth = '350px';
        indicator.style.pointerEvents = 'none';
        indicator.innerHTML = 'Starting OnlyFans chat scan...';
        document.body.appendChild(indicator);
        
        // Wait for page to be fully loaded - longer timeout
        await new Promise(resolve => setTimeout(resolve, 5000));
        indicator.innerHTML = 'Page loaded, finding chat container...';
        debugOverlay.innerHTML = 'PAGE LOADED! FINDING CHAT CONTAINER...';
        
        // Use multiple methods to find the chat container
        let chatListContainer = await findChatContainer(debugOverlay);
        
        if (!chatListContainer) {
            const errorMsg = 'Could not find chat container after multiple attempts';
            console.error('[OF Assistant] ' + errorMsg);
            indicator.style.background = 'rgba(255, 0, 0, 0.9)';
            indicator.innerHTML = errorMsg;
            debugOverlay.innerHTML = 'FATAL ERROR: NO CHAT CONTAINER FOUND';
            
            // Wait 5 seconds so user can see error before cleaning up
            await new Promise(resolve => setTimeout(resolve, 5000));
            document.body.removeChild(indicator);
            document.body.removeChild(debugOverlay);
            
            // Return a single test chat as fallback to prevent complete failure
            return ['https://onlyfans.com/my/chats/chat/1234/'];
        }
        
        // Highlight the container so user can see it
        highlightElement(chatListContainer, '3px dashed red');
        
        // Create central progress counter
        const progressCounter = document.createElement('div');
        progressCounter.style.position = 'fixed';
        progressCounter.style.top = '50%';
        progressCounter.style.left = '50%';
        progressCounter.style.transform = 'translate(-50%, -50%)';
        progressCounter.style.background = 'rgba(0, 0, 0, 0.8)';
        progressCounter.style.color = 'white';
        progressCounter.style.padding = '30px 40px';
        progressCounter.style.borderRadius = '15px';
        progressCounter.style.zIndex = '9999999';
        progressCounter.style.fontSize = '24px';
        progressCounter.style.fontWeight = 'bold';
        progressCounter.style.textAlign = 'center';
        progressCounter.style.pointerEvents = 'none';
        progressCounter.innerHTML = 'CHATS FOUND: 0';
        document.body.appendChild(progressCounter);
        
        // Initial chat URL extraction
        let allChatUrls = extractVisibleChatLinks();
        updateCounters(indicator, debugOverlay, progressCounter, allChatUrls.length, 0);
        
        // Create scroll indicators
        const {scrollIndicator, pulseScrollIndicator} = createScrollIndicator();
        
        // Core scrolling logic
        return await performScrolling(
            chatListContainer, 
            indicator, 
            debugOverlay, 
            progressCounter, 
            scrollIndicator, 
            pulseScrollIndicator, 
            allChatUrls
        );
    } catch (err) {
        console.error('[OF Assistant] Fatal error in chat list extraction:', err);
        alert('Error in OnlyFans chat scan: ' + err.message);
        return [testerURL];
    }
}

// Helper function to find the chat container using multiple methods
async function findChatContainer(debugOverlay) {
    let chatListContainer = null;
    let containerMethod = "";
    
    // Method 1: Try known selectors - most specific to least
    const selectors = [
        '.b-chats__list-dialogues',
        '.b-chats__scroller',
        '.b-chats__list',
        '.g-scrollbar__view',
        'div[class*="chat-"][class*="list"]',
        'div[class*="chat-"]',
        'div[class*="chats-"]'
    ];
    
    for (const selector of selectors) {
        try {
            const elements = document.querySelectorAll(selector);
            for (const el of elements) {
                if (el.scrollHeight > 100 && el.offsetHeight > 0) {
                    chatListContainer = el;
                    containerMethod = `selector: ${selector}`;
                    console.log(`[OF Assistant] Found chat container with ${containerMethod}`);
                    debugOverlay.innerHTML = `FOUND CONTAINER: ${selector}`;
                    break;
                }
            }
            if (chatListContainer) break;
        } catch (err) {
            console.warn(`[OF Assistant] Error with selector ${selector}:`, err);
        }
    }
    
    // Method 2: Find any scrollable elements that contain chat links
    if (!chatListContainer) {
        try {
            debugOverlay.innerHTML = 'LOOKING FOR CONTAINERS WITH CHAT LINKS...';
            
            // Find all elements containing chat links
            const allChatLinks = document.querySelectorAll('a[href*="/my/chats/chat/"]');
            if (allChatLinks.length > 0) {
                // Find common scrollable ancestor
                const potentialContainers = [];
                
                for (const link of allChatLinks) {
                    let parent = link.parentElement;
                    let depth = 0;
                    
                    while (parent && depth < 10) {
                        if (parent.scrollHeight > parent.clientHeight && parent.clientHeight > 200) {
                            potentialContainers.push({
                                element: parent,
                                depth: depth
                            });
                            break;
                        }
                        parent = parent.parentElement;
                        depth++;
                    }
                }
                
                // Find the most common container at the lowest depth
                if (potentialContainers.length > 0) {
                    // Sort by depth (ascending)
                    potentialContainers.sort((a, b) => a.depth - b.depth);
                    chatListContainer = potentialContainers[0].element;
                    containerMethod = "chat link ancestor";
                    debugOverlay.innerHTML = 'FOUND CONTAINER THROUGH CHAT LINKS!';
                }
            }
        } catch (err) {
            console.warn('[OF Assistant] Error finding container through chat links:', err);
        }
    }
    
    // Method 3: Use DOM traversal from the "MESSAGES" text
    if (!chatListContainer) {
        try {
            debugOverlay.innerHTML = 'LOOKING FOR MESSAGES HEADER...';
            
            // Find all text nodes
            const allTextNodes = [];
            const walker = document.createTreeWalker(
                document.body,
                NodeFilter.SHOW_TEXT,
                null,
                false
            );
            
            let node;
            while (node = walker.nextNode()) {
                if (node.textContent.trim() === 'MESSAGES') {
                    allTextNodes.push(node);
                }
            }
            
            // Find closest scrollable container
            for (const textNode of allTextNodes) {
                let element = textNode.parentElement;
                let depth = 0;
                
                while (element && depth < 10) {
                    // Check if this is a good container
                    if (element.scrollHeight > element.clientHeight && element.clientHeight > 200) {
                        chatListContainer = element;
                        containerMethod = "MESSAGES text ancestor";
                        debugOverlay.innerHTML = 'FOUND CONTAINER THROUGH MESSAGES TEXT!';
                        break;
                    }
                    
                    // Or check siblings at each level for scrollable containers
                    if (element.parentElement) {
                        const siblings = Array.from(element.parentElement.children);
                        
                        for (const sibling of siblings) {
                            if (sibling !== element && 
                                sibling.scrollHeight > sibling.clientHeight && 
                                sibling.clientHeight > 200) {
                                chatListContainer = sibling;
                                containerMethod = "MESSAGES sibling";
                                debugOverlay.innerHTML = 'FOUND CONTAINER AS SIBLING OF MESSAGES!';
                                break;
                            }
                        }
                    }
                    
                    if (chatListContainer) break;
                    element = element.parentElement;
                    depth++;
                }
                
                if (chatListContainer) break;
            }
        } catch (err) {
            console.warn('[OF Assistant] Error finding by MESSAGES header:', err);
        }
    }
    
    // Method 4: Last resort - scan all scrollable elements in middle of screen
    if (!chatListContainer) {
        try {
            debugOverlay.innerHTML = 'SCANNING ALL SCROLLABLE ELEMENTS...';
            
            // Get viewport dimensions
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // Score function for potential containers
            function scoreElement(el) {
                try {
                    const rect = el.getBoundingClientRect();
                    
                    // Skip invisible elements
                    if (rect.width === 0 || rect.height === 0) return -1;
                    
                    // Check if potentially scrollable
                    if (el.scrollHeight <= el.clientHeight) return -1;
                    
                    // Base score on position and size
                    let score = 0;
                    
                    // Prefer elements in the middle left of the screen (chat list location)
                    const horizontalCenterScore = 1 - Math.abs(rect.left - viewportWidth * 0.25) / viewportWidth;
                    score += horizontalCenterScore * 3;
                    
                    // Prefer taller elements
                    const heightScore = Math.min(rect.height / viewportHeight, 1);
                    score += heightScore * 5;
                    
                    // Prefer elements with chat-like class names
                    const className = el.className || '';
                    if (typeof className === 'string') {
                        if (className.includes('chat') || className.includes('list')) {
                            score += 3;
                        }
                        if (className.includes('scroll')) {
                            score += 2;
                        }
                    }
                    
                    return score;
                } catch (e) {
                    return -1;
                }
            }
            
            // Get all elements
            const allElements = document.querySelectorAll('*');
            let bestElement = null;
            let bestScore = -1;
            
            for (const el of allElements) {
                const score = scoreElement(el);
                if (score > bestScore) {
                    bestScore = score;
                    bestElement = el;
                }
            }
            
            if (bestElement && bestScore > 2) {
                chatListContainer = bestElement;
                containerMethod = "best element score";
                debugOverlay.innerHTML = `FOUND CONTAINER BY SCORING (${bestScore.toFixed(1)})`;
            }
        } catch (err) {
            console.warn('[OF Assistant] Error in element scoring:', err);
        }
    }
    
    // Log container details if found
    if (chatListContainer) {
        console.log('[OF Assistant] Selected container details:', {
            method: containerMethod,
            tagName: chatListContainer.tagName,
            className: chatListContainer.className,
            id: chatListContainer.id,
            scrollHeight: chatListContainer.scrollHeight,
            offsetHeight: chatListContainer.offsetHeight
        });
        
        debugOverlay.innerHTML = `USING CONTAINER: ${containerMethod}<br>CLASS: ${chatListContainer.className}`;
    }
    
    return chatListContainer;
}

// Helper to highlight elements visually
function highlightElement(element, style) {
    const originalOutline = element.style.outline;
    element.style.outline = style;
    setTimeout(() => {
        element.style.outline = originalOutline;
    }, 5000);
}

// Helper to update all counters consistently
function updateCounters(indicator, debugOverlay, progressCounter, chatCount, scrollCount) {
    indicator.innerHTML = `Found ${chatCount} chats, scroll #${scrollCount}`;
    debugOverlay.innerHTML = `FOUND ${chatCount} CHATS, SCROLL #${scrollCount}`;
    progressCounter.innerHTML = `CHATS FOUND: ${chatCount}<br><small>SCROLL #${scrollCount}</small>`;
}

// Create a visual scroll indicator
function createScrollIndicator() {
    const scrollIndicator = document.createElement('div');
    scrollIndicator.style.position = 'fixed';
    scrollIndicator.style.bottom = '20px';
    scrollIndicator.style.left = '20px';
    scrollIndicator.style.width = '30px';
    scrollIndicator.style.height = '30px';
    scrollIndicator.style.borderRadius = '50%';
    scrollIndicator.style.background = 'red';
    scrollIndicator.style.zIndex = '9999999';
    scrollIndicator.style.transition = 'all 0.2s ease';
    scrollIndicator.style.pointerEvents = 'none';
    document.body.appendChild(scrollIndicator);
    
    // Function to pulse the scroll indicator
    function pulseScrollIndicator() {
        scrollIndicator.style.transform = 'scale(1.5)';
        scrollIndicator.style.background = 'green';
        setTimeout(() => {
            scrollIndicator.style.transform = 'scale(1)';
            scrollIndicator.style.background = 'red';
        }, 150);
    }
    
    return { scrollIndicator, pulseScrollIndicator };
}

// Core scrolling logic
async function performScrolling(
    chatListContainer, 
    indicator, 
    debugOverlay, 
    progressCounter, 
    scrollIndicator, 
    pulseScrollIndicator, 
    allChatUrls
) {
    return new Promise(async (resolve) => {
        let scrollCount = 0;
        let sameCount = 0;
        let lastCount = allChatUrls.length;
        let isScrolling = true;
        let noNewChatsCounter = 0; // Counter for attempts with no new chats
        const MAX_NO_NEW_CHATS = 5; // Maximum consecutive attempts with no new chats
        
        // Create a very visible counter display
        const noNewChatsDisplay = document.createElement('div');
        noNewChatsDisplay.style.position = 'fixed';
        noNewChatsDisplay.style.top = '130px';
        noNewChatsDisplay.style.left = '20px';
        noNewChatsDisplay.style.background = 'rgba(0, 173, 239, 0.9)';
        noNewChatsDisplay.style.color = 'white';
        noNewChatsDisplay.style.padding = '15px 20px';
        noNewChatsDisplay.style.borderRadius = '5px';
        noNewChatsDisplay.style.zIndex = '99999999';
        noNewChatsDisplay.style.fontSize = '24px';
        noNewChatsDisplay.style.fontWeight = 'bold';
        noNewChatsDisplay.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.5)';
        noNewChatsDisplay.style.border = '3px solid white';
        noNewChatsDisplay.style.transition = 'all 0.3s ease';
        noNewChatsDisplay.innerHTML = '<span style="font-size: 28px;">🔄</span> NO NEW CHATS: 0/' + MAX_NO_NEW_CHATS;
        document.body.appendChild(noNewChatsDisplay);
        
        // Function to update the no new chats counter display
        function updateNoNewChatsCounter(count) {
            noNewChatsCounter = count;
            noNewChatsDisplay.innerHTML = `<span style="font-size: 28px;">${count === 0 ? '🔄' : count >= MAX_NO_NEW_CHATS ? '🛑' : '⚠️'}</span> NO NEW CHATS: <b>${count}</b>/${MAX_NO_NEW_CHATS}`;
            
            // Change color as we get closer to max
            if (count >= 4) {
                noNewChatsDisplay.style.background = 'rgba(255, 0, 0, 0.9)';
                noNewChatsDisplay.style.fontSize = '28px'; // Make bigger for emphasis
                noNewChatsDisplay.style.border = '3px solid yellow';
                // Add a pulse animation
                noNewChatsDisplay.style.animation = 'pulse 1s infinite';
                if (!document.querySelector('#pulse-animation')) {
                    const style = document.createElement('style');
                    style.id = 'pulse-animation';
                    style.textContent = `
                        @keyframes pulse {
                            0% { transform: scale(1); }
                            50% { transform: scale(1.05); }
                            100% { transform: scale(1); }
                        }
                    `;
                    document.head.appendChild(style);
                }
            } else if (count >= 3) {
                noNewChatsDisplay.style.background = 'rgba(255, 100, 0, 0.9)';
                noNewChatsDisplay.style.border = '3px solid white';
                noNewChatsDisplay.style.animation = '';
            } else if (count >= 2) {
                noNewChatsDisplay.style.background = 'rgba(255, 165, 0, 0.9)';
                noNewChatsDisplay.style.border = '3px solid white';
                noNewChatsDisplay.style.animation = '';
            } else if (count >= 1) {
                noNewChatsDisplay.style.background = 'rgba(255, 200, 0, 0.9)';
                noNewChatsDisplay.style.border = '3px solid white';
                noNewChatsDisplay.style.animation = '';
            } else {
                noNewChatsDisplay.style.background = 'rgba(0, 173, 239, 0.9)';
                noNewChatsDisplay.style.border = '3px solid white';
                noNewChatsDisplay.style.animation = '';
            }
            
            // Force stop if we reach the max
            if (count >= MAX_NO_NEW_CHATS) {
                console.log('[OF Assistant] COUNTER REACHED MAX! Stopping scroll process');
                forceStopScrolling();
            }
        }
        
        // Function to force stop the scrolling
        function forceStopScrolling() {
            console.log('[OF Assistant] Force stopping after ' + MAX_NO_NEW_CHATS + ' attempts with no new chats');
            isScrolling = false;
            
            if (scrollInterval) {
                clearInterval(scrollInterval);
            }
            
            debugOverlay.innerHTML = `FORCE STOPPED: NO NEW CHATS FOR ${MAX_NO_NEW_CHATS} ATTEMPTS<br>TOTAL: ${allChatUrls.length}`;
            indicator.innerHTML = `Finished: no new chats for ${MAX_NO_NEW_CHATS} attempts`;
            progressCounter.innerHTML = `SCAN COMPLETE<br>TOTAL CHATS: ${allChatUrls.length}`;
            
            // Make it very clear that we're stopping due to reaching max attempts
            noNewChatsDisplay.innerHTML = `<span style="font-size: 32px;">🛑</span> MAXIMUM ATTEMPTS REACHED (${MAX_NO_NEW_CHATS}/${MAX_NO_NEW_CHATS})`;
            noNewChatsDisplay.style.background = 'rgba(200, 0, 0, 0.95)';
            noNewChatsDisplay.style.fontSize = '28px';
            noNewChatsDisplay.style.padding = '20px 25px';
            noNewChatsDisplay.style.border = '3px solid yellow';
            
            // Add direct navigation button that users can click if auto-navigation fails
            const directNavigateButton = document.createElement('button');
            directNavigateButton.textContent = '➡️ PROCEED TO CHAT EXTRACTION';
            directNavigateButton.style.position = 'fixed';
            directNavigateButton.style.top = '50%';
            directNavigateButton.style.left = '50%';
            directNavigateButton.style.transform = 'translate(-50%, -50%)';
            directNavigateButton.style.padding = '20px 30px';
            directNavigateButton.style.backgroundColor = '#00adef';
            directNavigateButton.style.color = 'white';
            directNavigateButton.style.border = 'none';
            directNavigateButton.style.borderRadius = '10px';
            directNavigateButton.style.fontSize = '24px';
            directNavigateButton.style.fontWeight = 'bold';
            directNavigateButton.style.cursor = 'pointer';
            directNavigateButton.style.zIndex = '99999999';
            directNavigateButton.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.5)';
            
            directNavigateButton.addEventListener('click', function() {
                // Remove all UI elements immediately
                try {
                    const elementsToRemove = [
                        indicator, debugOverlay, progressCounter, 
                        scrollIndicator, noNewChatsDisplay, directNavigateButton,
                        document.querySelector('.of-message-assistant-popup')
                    ];
                    
                    for (const el of elementsToRemove) {
                        if (el && el.parentNode) {
                            el.parentNode.removeChild(el);
                        }
                    }
                    
                    // Remove any other elements that might have been created
                    const customElements = document.querySelectorAll('[id^=of-], [class^=of-]');
                    customElements.forEach(el => {
                        if (el.parentNode) el.parentNode.removeChild(el);
                    });
                } catch (e) {
                    console.error('[OF Assistant] Error removing UI elements:', e);
                }
                
                // Force navigate to first chat
                if (allChatUrls.length > 0) {
                    localStorage.setItem('of_chat_urls', JSON.stringify(allChatUrls));
                    localStorage.setItem('of_chat_index', '0');
                    localStorage.setItem('of_force_extraction', 'true');
                    
                    // Navigate with both methods for redundancy
                    try {
                        window.location.href = allChatUrls[0];
                        setTimeout(() => window.location.replace(allChatUrls[0]), 500);
                    } catch (e) {
                        alert('Navigation failed. Please refresh the page and try again.');
                    }
                }
            });
            
            document.body.appendChild(directNavigateButton);
            
            // Add text overlay explaining what's happening
            const infoOverlay = document.createElement('div');
            infoOverlay.style.position = 'fixed';
            infoOverlay.style.top = 'calc(50% - 100px)';
            infoOverlay.style.left = '50%';
            infoOverlay.style.transform = 'translate(-50%, -50%)';
            infoOverlay.style.background = 'rgba(0, 0, 0, 0.8)';
            infoOverlay.style.color = 'white';
            infoOverlay.style.padding = '20px';
            infoOverlay.style.borderRadius = '10px';
            infoOverlay.style.zIndex = '9999998';
            infoOverlay.style.fontSize = '18px';
            infoOverlay.style.maxWidth = '500px';
            infoOverlay.style.textAlign = 'center';
            infoOverlay.innerHTML = `<strong>SCAN COMPLETE</strong><br>TOTAL CHATS: ${allChatUrls.length}<br><br>
                           Automatically proceeding to chat extraction in 3 seconds...<br>
                           If nothing happens, click the button below`;
            document.body.appendChild(infoOverlay);
            
            // Immediately store the chat URLs and set up for forced extraction
            if (allChatUrls.length > 0) {
                localStorage.setItem('of_chat_urls', JSON.stringify(allChatUrls));
                localStorage.setItem('of_chat_index', '0');
                localStorage.setItem('of_force_extraction', 'true');
            }
            
            // IMPROVED: Add more aggressive UI cleanup and immediate navigation
            // Auto-click the button after 1 second to force navigation
            setTimeout(() => {
                console.log('[OF Assistant] Auto-clicking navigation button to force transition');
                try {
                    // Try to directly click the button programmatically
                    if (directNavigateButton && directNavigateButton.parentNode) {
                        directNavigateButton.click();
                    }
                } catch (e) {
                    console.error('[OF Assistant] Error auto-clicking navigate button:', e);
                }
            }, 1000);
            
            // IMPROVED: Force-start extraction regardless of UI state
            setTimeout(() => {
                try {
                    console.log('[OF Assistant] Last resort navigation to first chat URL');
                    if (allChatUrls.length > 0) {
                        // Clear any existing overlays that might block navigation
                        document.querySelectorAll('div[style*="position: fixed"], button[style*="position: fixed"]').forEach(el => {
                            try { 
                                if (el.parentNode) el.parentNode.removeChild(el);
                            } catch (e) {}
                        });
                        
                        // Reset any CSS that might be blocking clicks
                        const style = document.createElement('style');
                        style.textContent = `
                            * { pointer-events: auto !important; }
                            .of-overlay { display: none !important; }
                        `;
                        document.head.appendChild(style);
                        
                        // Try three different navigation methods in sequence
                        window.location.href = allChatUrls[0];
                        
                        setTimeout(() => {
                            window.location.replace(allChatUrls[0]);
                        }, 300);
                        
                        setTimeout(() => {
                            const a = document.createElement('a');
                            a.href = allChatUrls[0];
                            a.style.display = 'none';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                        }, 600);
                        
                        // Force full page reload if still on same page after 2 seconds
                        setTimeout(() => {
                            if (window.location.href.includes('/my/chats/') && 
                                !window.location.href.includes('/my/chats/chat/')) {
                                console.log('[OF Assistant] EMERGENCY RELOAD - still on chat list page');
                                window.location.reload();
                            }
                        }, 2000);
                    }
                } catch (e) {
                    console.error('[OF Assistant] Critical navigation error:', e);
                }
            }, 2000);
            
            // Proceed to completion with a shorter delay
            setTimeout(() => {
                try {
                    // Try to remove the info overlay and navigation button
                    if (infoOverlay && infoOverlay.parentNode) {
                        infoOverlay.parentNode.removeChild(infoOverlay);
                    }
                    if (directNavigateButton && directNavigateButton.parentNode) {
                        directNavigateButton.parentNode.removeChild(directNavigateButton);
                    }
                } catch (e) {
                    console.error('[OF Assistant] Error removing info elements:', e);
                }
                
                // Complete the process
                completeScrolling();
            }, 1000);
        }
        
        // Function to scroll with multiple methods
        async function scrollDown() {
            // Check for emergency stop
            if (GLOBAL_EMERGENCY_STOP) {
                console.log('[OF Assistant] Emergency stop detected in scrollDown');
                return false;
            }
            
            if (!isScrolling) return false;
            
            scrollCount++;
            pulseScrollIndicator();
            
            // METHOD 1: Direct scrollTop with larger jumps
            try {
                const originalScrollTop = chatListContainer.scrollTop;
                // Use much larger scroll size - over 1000px to ensure significant movement
                chatListContainer.scrollTop += 1200;
                
                debugOverlay.innerHTML = `SCROLLED: ${originalScrollTop} → ${chatListContainer.scrollTop}<br>SCROLL #${scrollCount}`;
                await sleep(500);
            } catch (err) {
                console.error('[OF Assistant] Error in direct scroll:', err);
            }
            
            // METHOD 2: Multiple aggressive wheel events
            try {
                // Send a series of larger wheel events (20 events instead of 10)
                for (let i = 0; i < 20; i++) {
                    // Much larger delta value (250-450) for more aggressive scrolling
                    const delta = 250 + (i * 10);
                    
                    const wheelEvent = new WheelEvent('wheel', {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        deltaY: delta  // POSITIVE for scrolling DOWN only
                    });
                    
                    chatListContainer.dispatchEvent(wheelEvent);
                    document.dispatchEvent(wheelEvent); // Also dispatch to document to catch event bubbling
                    await sleep(50); // Shorter wait between events
                }
                await sleep(300);
            } catch (err) {
                console.error('[OF Assistant] Error in wheel events:', err);
            }
            
            // METHOD 3: Simulate page down key
            try {
                const pageDownEvent = new KeyboardEvent('keydown', {
                    bubbles: true,
                    cancelable: true,
                    key: 'PageDown',
                    keyCode: 34,
                    which: 34
                });
                chatListContainer.dispatchEvent(pageDownEvent);
                document.dispatchEvent(pageDownEvent);
                await sleep(300);
            } catch (err) {
                console.error('[OF Assistant] Error simulating PageDown:', err);
            }
            
            // METHOD 4: Scroll element into view - find a chat element far down and scroll to it
            try {
                const chatItems = chatListContainer.querySelectorAll('a[href*="/my/chats/chat/"]');
                if (chatItems.length > 0) {
                    // Try to scroll to an item farther down (90% through the visible list)
                    const targetIndex = Math.min(
                        Math.floor(chatItems.length * 0.9), 
                        chatItems.length - 1
                    );
                    chatItems[targetIndex].scrollIntoView({ behavior: 'smooth', block: 'center' });
                    await sleep(500);
                }
            } catch (err) {
                console.error('[OF Assistant] Error in scrollIntoView:', err);
            }
            
            // Always check for "Load More" buttons
            try {
                const loadMoreButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
                    try {
                        const text = (btn.innerText || '').toLowerCase();
                        return text.includes('load') || text.includes('more');
                    } catch (e) {
                        return false;
                    }
                });
                
                if (loadMoreButtons.length > 0) {
                    debugOverlay.innerHTML = `CLICKING "LOAD MORE" BUTTON (Counter: ${noNewChatsCounter}/${MAX_NO_NEW_CHATS})`;
                    loadMoreButtons[0].click();
                    console.log(`[OF Assistant] Clicked "Load More" button - Not resetting counter (currently at ${noNewChatsCounter})`);
                    // Wait longer after clicking a load more button
                    await sleep(2500);
                    
                    // Don't reset the no new chats counter here - only reset when actual new chat links are found
                    // The counter will reset naturally in the main loop if new chats are found after clicking the button
                }
            } catch (e) {}
            
            // Wait for content to load - longer wait
            await sleep(3000);
            
            // Return true to indicate successful scroll
            return isScrolling;
        }
        
        // Start scrolling interval with a more careful approach
        const scrollInterval = setInterval(async () => {
            // First safety check - are we still scrolling?
            if (!isScrolling || GLOBAL_EMERGENCY_STOP) {
                clearInterval(scrollInterval);
                
                if (GLOBAL_EMERGENCY_STOP) {
                    console.log('[OF Assistant] Emergency stop detected in scroll interval');
                }
                
                return;
            }
            
            updateCounters(indicator, debugOverlay, progressCounter, allChatUrls.length, scrollCount + 1);
            
            // Perform the scroll - if returns false, scrolling was stopped
            const scrollSuccess = await scrollDown();
            if (!scrollSuccess) {
                clearInterval(scrollInterval);
                return;
            }
            
            // Extract new chats
            const newChats = extractVisibleChatLinks();
            const previousCount = allChatUrls.length;
            
            // Add new unique chats to our list
            let newChatsFound = 0;
            for (const url of newChats) {
                if (!allChatUrls.includes(url)) {
                    allChatUrls.push(url);
                    newChatsFound++;
                    console.log(`[OF Assistant] Found new chat: ${url}`);
                }
            }
            
            // Update with total
            updateCounters(indicator, debugOverlay, progressCounter, allChatUrls.length, scrollCount);
            
            // Check if we've found new chats in this iteration - FIXED LOGIC HERE
            if (newChatsFound > 0) {
                indicator.style.background = 'rgba(0, 200, 0, 0.9)';
                indicator.innerHTML = `Found ${newChatsFound} new chats! Total: ${allChatUrls.length}`;
                progressCounter.style.background = 'rgba(0, 150, 0, 0.9)';
                
                // Reset counters when new chats are found
                sameCount = 0;
                lastCount = allChatUrls.length;
                
                // Reset the no new chats counter to 0 when new chats are found
                console.log(`[OF Assistant] FOUND ${newChatsFound} NEW CHATS - Resetting no-new-chats counter to 0`);
                updateNoNewChatsCounter(0);
            } else {
                sameCount++;
                // Increment the no new chats counter
                const newCounterValue = noNewChatsCounter + 1;
                console.log(`[OF Assistant] NO NEW CHATS FOUND - Incrementing counter from ${noNewChatsCounter} to ${newCounterValue}`);
                updateNoNewChatsCounter(newCounterValue);
                
                indicator.style.background = 'rgba(0, 173, 239, 0.9)';
                progressCounter.style.background = 'rgba(0, 0, 0, 0.8)';
                
                // Update status with the count of attempts with no new chats
                debugOverlay.innerHTML = `NO NEW CHATS FOR ${noNewChatsCounter} ATTEMPTS<br>TOTAL: ${allChatUrls.length}`;
                
                // If we've reached MAX_NO_NEW_CHATS, the forceStopScrolling function will be called inside updateNoNewChatsCounter
                
                // Use more aggressive scrolling when stuck but not yet at the max
                if (sameCount % 3 === 0 && noNewChatsCounter < MAX_NO_NEW_CHATS) {
                    indicator.style.background = 'rgba(255, 165, 0, 0.9)';
                    indicator.innerHTML = `No new chats for ${sameCount} scrolls. Trying harder...`;
                    progressCounter.style.background = 'rgba(255, 120, 0, 0.9)';
                    
                    // Try more aggressive methods
                    await aggressiveScroll(chatListContainer);
                }
            }
        }, 6000); // 6 second interval between scroll attempts
        
        // Use an aggressive scroll when stuck
        async function aggressiveScroll(container) {
            // Check for emergency stop
            if (GLOBAL_EMERGENCY_STOP) {
                console.log('[OF Assistant] Emergency stop detected in aggressiveScroll');
                return;
            }
            
            if (!isScrolling) return;
            
            // Method 1: Very large direct jump
            try {
                container.scrollTop += 2400; // Double the normal jump
                await sleep(800);
                
                // Check emergency stop after each step
                if (GLOBAL_EMERGENCY_STOP) return;
            } catch (err) {}
            
            // Method 2: Rapid and large wheel events
            try {
                for (let i = 0; i < 30; i++) { // More events
                    if (!isScrolling || GLOBAL_EMERGENCY_STOP) break;
                    
                    const wheelEvent = new WheelEvent('wheel', {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        deltaY: 300 + (i * 5) // Larger and increasing delta (POSITIVE only)
                    });
                    
                    container.dispatchEvent(wheelEvent);
                    document.dispatchEvent(wheelEvent);
                    await sleep(30); // Faster sequence
                }
                
                // Check emergency stop after each step
                if (GLOBAL_EMERGENCY_STOP) return;
                
                await sleep(1000);
            } catch (err) {}
            
            // Method 3: Try to get to absolute bottom with multiple attempts
            try {
                for (let i = 0; i < 3; i++) {
                    if (!isScrolling || GLOBAL_EMERGENCY_STOP) break;
                    container.scrollTop = container.scrollHeight;
                    await sleep(500);
                }
                
                // Check emergency stop after each step
                if (GLOBAL_EMERGENCY_STOP) return;
            } catch (err) {}
            
            // Method 4: Find any chat elements and scroll to them
            try {
                if (!isScrolling || GLOBAL_EMERGENCY_STOP) return;
                
                const chatLinks = document.querySelectorAll('a[href*="/my/chats/chat/"]');
                if (chatLinks.length > 0) {
                    // Try the last one (furthest down)
                    const lastIndex = chatLinks.length - 1;
                    chatLinks[lastIndex].scrollIntoView({behavior: 'smooth'});
                    await sleep(800);
                    
                    // Then scroll more
                    container.scrollTop += 1800;
                }
                
                // Check emergency stop after each step
                if (GLOBAL_EMERGENCY_STOP) return;
                
                await sleep(1000);
            } catch (err) {}
            
            // Method 5: Simulate rapid space key presses
            try {
                for (let i = 0; i < 10; i++) {
                    if (!isScrolling || GLOBAL_EMERGENCY_STOP) break;
                    
                    const spaceEvent = new KeyboardEvent('keydown', {
                        bubbles: true,
                        cancelable: true,
                        key: ' ',
                        keyCode: 32,
                        which: 32
                    });
                    document.dispatchEvent(spaceEvent);
                    await sleep(100);
                }
                
                // Check emergency stop after each step
                if (GLOBAL_EMERGENCY_STOP) return;
                
                await sleep(800);
            } catch (err) {}
        }
        
        // Function to handle completion
        function completeScrolling() {
            if (!isScrolling) return; // Avoid running twice
            
            console.log(`[OF Assistant] ${new Date().toISOString()} - completeScrolling function called`);
            
            isScrolling = false;
            clearInterval(scrollInterval);
            
            // Cancel any other intervals or timeouts that might interfere
            const highestTimeoutId = setTimeout(() => {});
            for (let i = 0; i < highestTimeoutId; i++) {
                clearTimeout(i);
            }
            
            // Visual indication of completion
            indicator.innerHTML = 'Finished scrolling, total chats: ' + allChatUrls.length;
            debugOverlay.innerHTML = `FINISHED SCROLLING<br>TOTAL CHATS: ${allChatUrls.length}`;
            progressCounter.innerHTML = `SCAN COMPLETE<br>TOTAL CHATS: ${allChatUrls.length}`;
            progressCounter.style.background = 'rgba(0, 120, 0, 0.9)';
            
            // Function to aggressively clean up UI elements
            function cleanupAllUIElements() {
                console.log(`[OF Assistant] ${new Date().toISOString()} - Performing aggressive UI cleanup`);
                
                try {
                    // 1. Try to remove specific elements
                    const elementsToRemove = [
                        indicator, debugOverlay, progressCounter, scrollIndicator, 
                        noNewChatsDisplay, document.querySelector('#of-emergency-stop'),
                        document.querySelector('.of-message-assistant-popup')
                    ];
                    
                    for (const el of elementsToRemove) {
                        try {
                            if (el && el.parentNode) {
                                el.parentNode.removeChild(el);
                            }
                        } catch (e) {
                            console.warn('[OF Assistant] Error removing specific element:', e);
                        }
                    }
                    
                    // 2. Try to remove elements by class pattern
                    const patternElements = document.querySelectorAll('[class*="of-"], [class*="OF-"], [id*="of-"], [id*="OF-"]');
                    patternElements.forEach(el => {
                        try {
                            if (el && el.parentNode) {
                                el.parentNode.removeChild(el);
                            }
                        } catch (e) {}
                    });
                    
                    // 3. Try to remove fixed position elements that might be overlays
                    const possibleOverlays = document.querySelectorAll('div[style*="position: fixed"]');
                    possibleOverlays.forEach(el => {
                        // Skip certain system UI elements
                        if (el.classList.contains('system-ui') || el.id === 'root' || el.id === 'app') {
                            return;
                        }
                        
                        try {
                            if (el && el.parentNode) {
                                el.parentNode.removeChild(el);
                            }
                        } catch (e) {}
                    });
                    
                    console.log('[OF Assistant] UI cleanup completed');
                } catch (err) {
                    console.error('[OF Assistant] Error in UI cleanup:', err);
                }
            }
            
            // Function to force navigate to the first chat with debugging
            function directlyNavigateToChat() {
                console.log(`[OF Assistant] ${new Date().toISOString()} - Directly navigating to chat`);
                
                if (allChatUrls.length === 0) {
                    console.error('[OF Assistant] No chat URLs available for navigation');
                    return;
                }
                
                try {
                    // Store the chat URLs in localStorage
                    localStorage.setItem('of_chat_urls', JSON.stringify(allChatUrls));
                    localStorage.setItem('of_chat_index', '0');
                    localStorage.setItem('of_force_extraction', 'true');
                    console.log(`[OF Assistant] Saved ${allChatUrls.length} URLs to localStorage`);
                    
                    const firstUrl = allChatUrls[0];
                    console.log(`[OF Assistant] Navigating to first URL: ${firstUrl}`);
                    
                    // IMPROVED: Create a direct action button to help users
                    const directButton = document.createElement('button');
                    directButton.textContent = '🔄 Click If Navigation Fails';
                    directButton.style.position = 'fixed';
                    directButton.style.top = '50%';
                    directButton.style.left = '50%';
                    directButton.style.transform = 'translate(-50%, -50%)';
                    directButton.style.padding = '20px 30px';
                    directButton.style.backgroundColor = 'red';
                    directButton.style.color = 'white';
                    directButton.style.border = 'none';
                    directButton.style.borderRadius = '10px';
                    directButton.style.fontSize = '24px';
                    directButton.style.fontWeight = 'bold';
                    directButton.style.cursor = 'pointer';
                    directButton.style.zIndex = '9999999';
                    
                    directButton.addEventListener('click', function() {
                        try {
                            // Remove any overlays
                            document.querySelectorAll('div[style*="position: fixed"]').forEach(el => {
                                try { if (el.parentNode) el.parentNode.removeChild(el); } catch(e) {}
                            });
                            
                            // Try navigation again
                            window.location.href = firstUrl;
                        } catch(e) {
                            alert('Please navigate manually to: ' + firstUrl);
                        }
                    });
                    
                    document.body.appendChild(directButton);
                    
                    // Method 1: Direct replacement
                    window.location.replace(firstUrl);
                    
                    // Method 2: Set href with delay as backup
                    setTimeout(() => {
                        console.log('[OF Assistant] Using backup navigation method');
                        window.location.href = firstUrl;
                        
                        // Cleanup button after 10 seconds if navigation doesn't happen
                        setTimeout(() => {
                            try { if (directButton.parentNode) directButton.parentNode.removeChild(directButton); } catch(e) {}
                        }, 10000);
                    }, 200);
                    
                    // Method 3: Create and click a link as final fallback
                    setTimeout(() => {
                        try {
                            console.log('[OF Assistant] Using fallback link click method');
                            const a = document.createElement('a');
                            a.href = firstUrl;
                            a.style.display = 'none';
                            document.body.appendChild(a);
                            a.click();
                        } catch (e) {
                            console.error('[OF Assistant] Error with link click method:', e);
                        }
                    }, 500);
                    
                    // IMPROVED: Direct JavaScript navigation if other methods fail
                    setTimeout(() => {
                        if (window.location.href.includes('/my/chats/') && 
                            !window.location.href.includes('/my/chats/chat/')) {
                            console.log('[OF Assistant] CRITICAL: Still on chat list. Forcing navigation...');
                            try {
                                window.location = firstUrl; // Different syntax as last resort
                                setTimeout(() => {
                                    if (window.location.href.includes('/my/chats/') && 
                                        !window.location.href.includes('/my/chats/chat/')) {
                                        window.location.reload(); // Force reload as final attempt
                                    }
                                }, 1000);
                            } catch(e) {
                                console.error('[OF Assistant] Critical navigation error:', e);
                            }
                        }
                    }, 3000);
                } catch (err) {
                    console.error('[OF Assistant] Fatal error during navigation:', err);
                    alert('Navigation error! Please manually go to: ' + allChatUrls[0]);
                }
            }
            
            // One final check for any missed chats
            setTimeout(() => {
                console.log(`[OF Assistant] ${new Date().toISOString()} - Doing final check for missed chats`);
                
                const finalChats = extractVisibleChatLinks();
                let addedInFinalScan = 0;
                
                for (const url of finalChats) {
                    if (!allChatUrls.includes(url)) {
                        allChatUrls.push(url);
                        addedInFinalScan++;
                    }
                }
                
                if (addedInFinalScan > 0) {
                    progressCounter.innerHTML = `SCAN COMPLETE<br>FOUND ${addedInFinalScan} MORE IN FINAL SCAN<br>TOTAL: ${allChatUrls.length}`;
                    console.log(`[OF Assistant] Found ${addedInFinalScan} more chats in final scan`);
                }
                
                console.log(`[OF Assistant] ${new Date().toISOString()} - Final chat count: ${allChatUrls.length}`);
                
                // Show a clear indicator that we're about to start chat extraction
                const nextStepIndicator = document.createElement('div');
                nextStepIndicator.style.position = 'fixed';
                nextStepIndicator.style.top = '50%';
                nextStepIndicator.style.left = '50%';
                nextStepIndicator.style.transform = 'translate(-50%, -50%)';
                nextStepIndicator.style.background = 'rgba(0, 100, 0, 0.9)';
                nextStepIndicator.style.color = 'white';
                nextStepIndicator.style.padding = '30px 40px';
                nextStepIndicator.style.borderRadius = '15px';
                nextStepIndicator.style.zIndex = '9999999';
                nextStepIndicator.style.fontSize = '28px';
                nextStepIndicator.style.fontWeight = 'bold';
                nextStepIndicator.style.boxShadow = '0 0 30px rgba(0, 0, 0, 0.7)';
                nextStepIndicator.style.border = '3px solid white';
                nextStepIndicator.style.textAlign = 'center';
                nextStepIndicator.innerHTML = `<div style="font-size: 40px; margin-bottom: 15px;">🚀</div>
                                             STARTING CHAT EXTRACTION<br>
                                             <span style="font-size: 22px; opacity: 0.9;">Navigating to first chat...</span>`;
                document.body.appendChild(nextStepIndicator);
                
                // Function to force navigate to the first chat
                console.log(`[OF Assistant] ${new Date().toISOString()} - Starting cleanup and navigation sequence`);
                
                // Clean up UI elements and directly navigate after a short delay
                setTimeout(() => {
                    console.log(`[OF Assistant] ${new Date().toISOString()} - Final cleanup started`);
                    cleanupAllUIElements();
                    
                    console.log(`[OF Assistant] ${new Date().toISOString()} - Starting direct navigation`);
                    directlyNavigateToChat();
                    
                    console.log(`[OF Assistant] ${new Date().toISOString()} - Returning to caller`);
                    resolve(allChatUrls);
                }, 1000); // Shortened delay to start navigation sooner
            }, 1000);
        }
        
        // Safety timeout (still keep as backup but with longer time)
        setTimeout(() => {
            if (!isScrolling) return;
            
            console.log('[OF Assistant] Safety timeout reached, ending scan');
            isScrolling = false;
            clearInterval(scrollInterval);
            
            debugOverlay.innerHTML = `TIMEOUT - ENDING SCAN<br>TOTAL CHATS: ${allChatUrls.length}`;
            indicator.innerHTML = `Timeout reached with ${allChatUrls.length} chats`;
            progressCounter.innerHTML = `TIMEOUT REACHED<br>TOTAL: ${allChatUrls.length}`;
            progressCounter.style.background = 'rgba(200, 100, 0, 0.9)';
            
            // Show timeout indicator but still continue to next step
            const timeoutIndicator = document.createElement('div');
            timeoutIndicator.style.position = 'fixed';
            timeoutIndicator.style.top = '50%';
            timeoutIndicator.style.left = '50%';
            timeoutIndicator.style.transform = 'translate(-50%, -50%)';
            timeoutIndicator.style.background = 'rgba(200, 100, 0, 0.9)';
            timeoutIndicator.style.color = 'white';
            timeoutIndicator.style.padding = '30px 40px';
            timeoutIndicator.style.borderRadius = '15px';
            timeoutIndicator.style.zIndex = '9999999';
            timeoutIndicator.style.fontSize = '28px';
            timeoutIndicator.style.fontWeight = 'bold';
            timeoutIndicator.style.boxShadow = '0 0 30px rgba(0, 0, 0, 0.7)';
            timeoutIndicator.style.border = '3px solid white';
            timeoutIndicator.style.textAlign = 'center';
            timeoutIndicator.innerHTML = `<div style="font-size: 40px; margin-bottom: 15px;">⏱️</div>
                                        SCAN TIMEOUT REACHED<br>
                                        <span style="font-size: 22px; opacity: 0.9;">Found ${allChatUrls.length} chats - Continuing to extraction</span>`;
            document.body.appendChild(timeoutIndicator);
            
            setTimeout(() => {
                try {
                    // Safely remove elements with try-catch for each
                    try { document.body.removeChild(indicator); } catch(e) {}
                    try { document.body.removeChild(debugOverlay); } catch(e) {}
                    try { document.body.removeChild(progressCounter); } catch(e) {}
                    try { document.body.removeChild(scrollIndicator); } catch(e) {}
                    try { document.body.removeChild(noNewChatsDisplay); } catch(e) {}
                    
                    // Save the chat URLs and start navigation, just like in completeScrolling
                    if (allChatUrls.length > 0) {
                        console.log(`[OF Assistant] Completed finding a total of ${allChatUrls.length} chats. Starting extraction process...`);
                        
                        // Reuse the forced navigation approach
                        try {
                            // Store the chat URLs in localStorage
                            localStorage.setItem('of_chat_urls', JSON.stringify(allChatUrls));
                            localStorage.setItem('of_chat_index', '0');
                            
                            // Add a flag to indicate this is a forced navigation
                            localStorage.setItem('of_force_extraction', 'true');
                            
                            const firstChatUrl = allChatUrls[0];
                            console.log(`[OF Assistant] FORCE NAVIGATING to first chat from timeout: ${firstChatUrl}`);
                            
                            // Use multiple methods to ensure navigation works
                            
                            // Method 1: Direct location change
                            window.location.href = firstChatUrl;
                            
                            // Method 2: Create and click a link (backup method)
                            setTimeout(() => {
                                try {
                                    const tempLink = document.createElement('a');
                                    tempLink.href = firstChatUrl;
                                    tempLink.style.display = 'none';
                                    document.body.appendChild(tempLink);
                                    tempLink.click();
                                    document.body.removeChild(tempLink);
                                } catch (e) {
                                    console.error('[OF Assistant] Error with backup navigation method:', e);
                                }
                            }, 500);
                            
                            // Method 3: Reload with new URL after short delay as final fallback
                            setTimeout(() => {
                                if (window.location.href !== firstChatUrl && !window.location.href.includes(firstChatUrl.split('/').pop())) {
                                    console.log('[OF Assistant] Using fallback navigation reload method');
                                    window.location.replace(firstChatUrl);
                                }
                            }, 1500);
                        } catch (navErr) {
                            console.error('[OF Assistant] Navigation error in timeout handler:', navErr);
                            // Try alternative method
                            window.location.replace(allChatUrls[0]);
                        }
                    } else {
                        console.error('[OF Assistant] No chat URLs found after timeout');
                        try { document.body.removeChild(timeoutIndicator); } catch(e) {}
                        alert('No chat URLs found to process!');
                    }
                } catch (e) {
                    console.error('[OF Assistant] Error during cleanup and navigation:', e);
                    // Even if there was an error, try to continue to the next stage
                    if (allChatUrls.length > 0) {
                        try {
                            localStorage.setItem('of_chat_urls', JSON.stringify(allChatUrls));
                            localStorage.setItem('of_chat_index', '0');
                            localStorage.setItem('of_force_extraction', 'true');
                            window.location.href = allChatUrls[0];
                        } catch (navErr) {
                            console.error('[OF Assistant] Critical error during navigation in timeout:', navErr);
                            alert('Error occurred during chat scanning. Please try again.');
                        }
                    }
                }
                resolve(allChatUrls);
            }, 3000);
        }, 300000); // 5 minutes max as a fallback
    });
}

// Listen for trigger from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'startAutoScrape') {
        // Store the photoCost value from the popup if provided
        if (request.photoCost) {
            localStorage.setItem('of_photo_cost', request.photoCost);
        }
        // Clear localStorage at the start of each run to avoid stale data
        console.log('[OF Assistant] Clearing localStorage to ensure clean start');
        try {
            localStorage.removeItem('of_chat_urls');
            localStorage.removeItem('of_chat_index');
        } catch (err) {
            console.error('[OF Assistant] Error clearing localStorage:', err);
        }
        
        // Use the MODE constant instead of localStorage
        if (MODE === 'test') {
            // Test mode: Only use the test URL
            const testUrl = testerURL;
            console.log('[OF Assistant] TEST MODE: Using single test URL:', testUrl);
            
            // Validate test URL
            if (!testUrl || !testUrl.includes('/my/chats/chat/')) {
                console.error('[OF Assistant] TEST MODE ERROR: Invalid test URL:', testUrl);
                alert('Test mode error: Invalid test URL. Please check the testerURL variable.');
                sendResponse({ success: false, error: 'Invalid test URL' });
                return true;
            }
            
            localStorage.setItem('of_chat_urls', JSON.stringify([testUrl]));
            localStorage.setItem('of_chat_index', '0');
            localStorage.setItem('of_current_index', '0'); // Initialize for interruptible processing
            localStorage.setItem('of_force_extraction', 'true'); // Force extraction to start
            
            // Use the same interruptible processing system for test mode
            console.log('[OF Assistant] TEST MODE: Starting interruptible processing system...');
            startSequentialProcessing();
            
            sendResponse({ success: true, mode: 'test' });
            return true;
        } else {
            // Live mode: If we're on the chat list page, auto-scroll and extract all chat links, then start the process
            if (window.location.pathname === '/my/chats' || window.location.pathname === '/my/chats/') {
                console.log('[OF Assistant] LIVE MODE: Starting chat URL detection...');
                autoScrollChatListAndGetLinks().then(chatUrls => {
                    if (!chatUrls.length) {
                        console.error('[OF Assistant] ERROR: No chat links found!');
                        alert('No chat links found!');
                        return;
                    }
                    
                    console.log(`[OF Assistant] SUCCESS: Found ${chatUrls.length} chat URLs:`);
                    chatUrls.forEach((url, index) => {
                        console.log(`[OF Assistant] Chat URL #${index + 1}: ${url}`);
                    });
                    
                    localStorage.setItem('of_chat_urls', JSON.stringify(chatUrls));
                    localStorage.setItem('of_chat_index', '0');
                    localStorage.setItem('of_current_index', '0'); // Initialize for interruptible processing
                    
                    console.log(`[OF Assistant] Starting interruptible processing system...`);
                    // Start the new interruptible processing system
                    startSequentialProcessing();
                });
            } else {
                alert('Please start from the chat list page!');
            }
            sendResponse({ success: true, mode: 'live' });
            return true;
        }
    }
    if (request.type === 'sendToWebhook') {
        fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(request.payload)
        })
        .then(async (response) => {
            console.log('[OF Assistant BG] Webhook response status:', response.status);
            if (!response.ok) {
                console.error('[OF Assistant BG] Webhook error response:', response.statusText);
            }
            const data = await response.json();
            sendResponse({ success: true, data });
        })
        .catch(err => {
            console.error('[OF Assistant BG] Detailed fetch error:', err.toString(), err);
            sendResponse({ success: false, error: err.toString() });
        });
        return true;
    }
    if (request.type === 'storeChatData') {
        const { fanUsername, chatUrl, messages } = request;
        
        // Enhance the data with user information
        chrome.storage.local.get(['supabaseSession'], (session) => {
            const userEmail = session?.supabaseSession?.user?.email || null;
            const userId = session?.supabaseSession?.user?.id || null;
            
            // Send enhanced data to background script
            chrome.runtime.sendMessage({ 
                type: 'storeChatData', 
                fanUsername, 
                chatUrl, 
                messages,
                userEmail,
                userId
            }, (response) => {
                console.log('[OF Assistant] storeChatData response:', response);
            });
        });
        
        // Debug: Print the data being received
        console.log('[OF Assistant] Received storeChatData:', {
            fanUsername,
            chatUrl,
            messages
        });
        sendResponse({ success: true });
        return true; // async
    }
    if (request.type === 'startAutoScrape') {
        if (request.photoCost) {
            localStorage.setItem('of_photo_cost', request.photoCost);
        }
        // ... existing logic ...
    }
});

// Add a global flag to prevent multiple extractions
window.__of_extraction_started = window.__of_extraction_started || false;

function runSequentialExtraction() {
    if (window.__of_extraction_started) {
        console.log('[OF Assistant] Extraction already started, skipping duplicate call.');
        return;
    }
    window.__of_extraction_started = true;
    
    try {
        console.log('[OF Assistant] Starting interruptible processing system...');
        
        // Create extraction status indicator
        const statusIndicator = document.createElement('div');
        statusIndicator.style.position = 'fixed';
        statusIndicator.style.bottom = '20px';
        statusIndicator.style.left = '20px';
        statusIndicator.style.background = 'rgba(0, 0, 100, 0.9)';
        statusIndicator.style.color = 'white';
        statusIndicator.style.padding = '15px 20px';
        statusIndicator.style.borderRadius = '10px';
        statusIndicator.style.zIndex = '99999998'; // Just below debug overlay
        statusIndicator.style.fontSize = '16px';
        statusIndicator.style.fontWeight = 'bold';
        statusIndicator.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.5)';
        statusIndicator.style.maxWidth = '350px';
        statusIndicator.innerHTML = 'Starting interruptible processing...';
        document.body.appendChild(statusIndicator);
        
        // Initialize interruptible processing
        startSequentialProcessing();
        
    } catch (err) {
        console.error('[OF Assistant] Error starting interruptible processing:', err);
        window.__of_extraction_started = false;
    }
}
                                        console.log(`[OF Assistant] ✅ COMPLETED: All ${totalChats} chats have been processed successfully!`);
                                        statusIndicator.innerHTML = `<span style="font-size: 20px;">✅</span> COMPLETED!<br>All ${totalChats} chats processed successfully`;
                                        statusIndicator.style.background = 'rgba(0, 150, 0, 0.9)';
                                        localStorage.removeItem('of_chat_urls');
                                        localStorage.removeItem('of_chat_index');
                                        localStorage.removeItem('of_force_extraction');
                                        localStorage.setItem('of_scan_complete_restart', 'true'); // Set flag to indicate scan completion and desire to restart
                                        


// On page load, check if we are in the extraction process
if (localStorage.getItem('of_chat_urls')) {
    const urls = JSON.parse(localStorage.getItem('of_chat_urls') || '[]');
    const idx = parseInt(localStorage.getItem('of_chat_index') || '0', 10);
    console.log(`[OF Assistant] Detected ongoing extraction process: ${urls.length} total chats, current index: ${idx}`);
    
    // Create emergency stop button right away
    createEmergencyStopButton();
    
    // Check if this is a forced extraction scenario
    const isForced = localStorage.getItem('of_force_extraction') === 'true';
    if (isForced) {
        console.log('[OF Assistant] Detected FORCED EXTRACTION flag - will guarantee extraction starts');
        localStorage.removeItem('of_force_extraction'); // Clear the flag
    }
    
    // Add visible debugging overlay
    const debugOverlay = document.createElement('div');
    debugOverlay.style.position = 'fixed';
    debugOverlay.style.top = '100px';
    debugOverlay.style.right = '20px';
    debugOverlay.style.background = isForced ? 'rgba(0, 200, 0, 0.9)' : 'rgba(255, 0, 255, 0.9)';
    debugOverlay.style.color = 'white';
    debugOverlay.style.padding = '15px 20px';
    debugOverlay.style.borderRadius = '10px';
    debugOverlay.style.zIndex = '99999999';
    debugOverlay.style.fontSize = '18px';
    debugOverlay.style.fontWeight = 'bold';
    debugOverlay.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.5)';
    debugOverlay.style.maxWidth = '400px';
    debugOverlay.innerHTML = `${isForced ? '🚀 FORCED EXTRACTION ACTIVE' : 'EXTRACTION PROCESS DETECTED'}<br>
                            Total chats: ${urls.length}<br>
                            Current index: ${idx}<br>
                            Current chat: ${urls[idx] || 'unknown'}<br>
                            Current URL: ${window.location.href}`;
    
    // Add start extraction button
    const startExtractionButton = document.createElement('button');
    startExtractionButton.innerText = '▶️ Force Start Extraction';
    startExtractionButton.style.marginTop = '10px';
    startExtractionButton.style.marginBottom = '5px';
    startExtractionButton.style.padding = '8px 15px';
    startExtractionButton.style.backgroundColor = 'green';
    startExtractionButton.style.color = 'white';
    startExtractionButton.style.border = 'none';
    startExtractionButton.style.borderRadius = '5px';
    startExtractionButton.style.cursor = 'pointer';
    startExtractionButton.style.fontWeight = 'bold';
    startExtractionButton.style.width = '100%';
    
    startExtractionButton.addEventListener('click', function() {
        console.log('[OF Assistant] User clicked Force Start Extraction');
        debugOverlay.innerHTML += '<br>Manually starting extraction...';
        
        // Run extraction with small delay to update UI first
        setTimeout(runSequentialExtraction, 500);
    });
    
    // Add reset button to debugOverlay
    const resetButton = document.createElement('button');
    resetButton.innerText = '🗑️ Reset Process';
    resetButton.style.marginTop = '5px';
    resetButton.style.padding = '8px 15px';
    resetButton.style.backgroundColor = 'red';
    resetButton.style.color = 'white';
    resetButton.style.border = 'none';
    resetButton.style.borderRadius = '5px';
    resetButton.style.cursor = 'pointer';
    resetButton.style.fontWeight = 'bold';
    resetButton.style.width = '100%';
    
    resetButton.addEventListener('click', function() {
        try {
            localStorage.removeItem('of_chat_urls');
            localStorage.removeItem('of_chat_index');
            localStorage.removeItem('of_force_extraction');
            debugOverlay.innerHTML = 'PROCESS RESET!<br>All localStorage data cleared.<br>Refreshing page...';
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } catch (e) {
            debugOverlay.innerHTML += '<br>Error clearing data!';
        }
    });
    
    // Append buttons to the debug overlay
    debugOverlay.appendChild(startExtractionButton);
    debugOverlay.appendChild(resetButton);
    document.body.appendChild(debugOverlay);
    
    if (idx < urls.length) {
        console.log(`[OF Assistant] Current chat: ${idx + 1} of ${urls.length} - ${urls[idx]}`);
        
        // Add more aggressive URL match checking
        console.log(`[OF Assistant] URL comparison:
                    Current: ${window.location.href} 
                    Expected: ${urls[idx]}
                    Exact match: ${window.location.href === urls[idx]}
                    Includes check: ${window.location.href.includes(urls[idx].split('/').pop())}
                    `);
                    
        // Force a reload if we're on the wrong URL
        if (!window.location.href.includes(urls[idx].split('/').pop())) {
            console.log(`[OF Assistant] We're on the wrong URL. Will navigate to correct chat URL in 5 seconds...`);
            debugOverlay.style.background = 'rgba(255, 0, 0, 0.9)';
            debugOverlay.innerHTML += `<br><br>WRONG URL DETECTED!<br>Redirecting to correct chat in 5 seconds...`;
            
            setTimeout(() => {
                window.location.href = urls[idx];
            }, 5000);
        }
        else {
            debugOverlay.innerHTML += `<br><br>CORRECT URL - Running extraction soon...`;
            
            // If this is a forced extraction or we're on the right URL, start the extraction immediately
            if (isForced) {
                console.log('[OF Assistant] Forced extraction - starting immediately');
                setTimeout(runSequentialExtraction, 1000);
            }
        }
    }
    
    // Attach to both load and DOMContentLoaded to ensure it runs
    window.addEventListener('load', function() {
        console.log('[OF Assistant] Window load event - running extraction');
        debugOverlay.innerHTML += `<br>Window load event triggered`;
        setTimeout(runSequentialExtraction, 1000); // Run with a slight delay after load
    });
    
    window.addEventListener('DOMContentLoaded', function() {
        console.log('[OF Assistant] DOMContentLoaded event - running extraction');
        debugOverlay.innerHTML += `<br>DOMContentLoaded event triggered`;
        setTimeout(runSequentialExtraction, 1500); // Run with a slightly longer delay
    });
    
    // Also run directly with a timeout as a fallback
    setTimeout(function() {
        console.log('[OF Assistant] Running extraction from timeout fallback');
        debugOverlay.innerHTML += `<br>Timeout fallback triggered`;
        runSequentialExtraction();
    }, 3000);
}

// Also add an explicit check for URLs that contain "/my/chats/chat/" to catch cases that might be missed
if (window.location.href.includes('/my/chats/chat/') && localStorage.getItem('of_chat_urls')) {
    console.log('[OF Assistant] On a chat page with localStorage data - this should trigger extraction');
    
    // Wait for page to load and force run the extraction to be sure
    setTimeout(function() {
        console.log('[OF Assistant] Forcing extraction from URL check');
        runSequentialExtraction();
    }, 4000);
}

// Helper to send message to webhook and wait for response
function sendToWebhook(payload) {
    return new Promise((resolve) => {
        try {
            // Get user email and ID from Chrome storage
            chrome.storage.local.get(['supabaseSession'], (session) => {
                // Allow direct values in payload to take precedence over session values
                const userEmail = payload.directUserEmail || session?.supabaseSession?.user?.email || localStorage.getItem('of_user_email') || null;
                const userId = payload.directUserId || session?.supabaseSession?.user?.id || localStorage.getItem('of_user_id') || null;
                
                // Clean up the payload by removing temporary direct properties if they exist
                const { directUserEmail, directUserId, ...cleanPayload } = payload;
                
                // Enhance payload with user information from all possible sources
                const enhancedPayload = {
                    ...cleanPayload,
                    userEmail,
                    userId,
                    timestamp: new Date().toISOString()
                };

                // Log the enhanced payload for debugging
                console.log('[OF Assistant] Sending enhanced webhook payload with user info:', {
                    userEmail,
                    userId
                });
                
                chrome.runtime.sendMessage({
                    type: 'sendToWebhook',
                    payload: enhancedPayload
                }, (response) => {
                    try {
                        if (chrome.runtime.lastError) {
                            console.warn('[OF Assistant] Webhook message port closed:', chrome.runtime.lastError.message);
                            resolve({ success: false, error: chrome.runtime.lastError.message });
                            return;
                        }
                        if (response && response.success) {
                            resolve({ success: true, data: response.data });
                        } else {
                            resolve({ success: false, error: response && response.error });
                        }
                    } catch (err) {
                        console.error('[OF Assistant] Error in webhook response handler:', err);
                        resolve({ success: false, error: 'Error handling webhook response' });
                    }
                });
            });
        } catch (err) {
            console.error('[OF Assistant] Error sending to webhook:', err);
            resolve({ success: false, error: 'Failed to send to webhook' });
        }
    });
}

// Helper to format date labels like 'Today' or 'Yesterday' to 'Mmm dd, yyyy'
function formatDateLabel(label) {
    if (!label) return null;
    label = label.trim();
    if (label.toLowerCase() === 'today') {
        const today = new Date();
        return today.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    if (label.toLowerCase() === 'yesterday') {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        return yesterday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    // If label is like 'Nov 30' (with or without leading/trailing spaces), add current year
    if (/^[A-Za-z]{3} \d{1,2}$/.test(label)) {
        const year = new Date().getFullYear();
        return label + ', ' + year;
    }
    // Otherwise, return the label as is (e.g., 'Nov 30, 2024')
    return label;
}

// Helper to find the closest previous date marker for a message
function findClosestDateElement(messageEl) {
    let el = messageEl;
    while (el) {
        // Check if this element is a date marker itself
        if (el.tagName === 'SPAN' && el.hasAttribute('title')) {
            const label = el.innerText.trim();
            if (/^[A-Za-z]{3} \d{1,2}$/.test(label) || /^[A-Za-z]{3} \d{1,2}, \d{4}$/.test(label) || /^(Today|Yesterday)$/i.test(label)) {
                return formatDateLabel(label);
            }
        }
        // Or if it contains a date marker as a direct child
        const dateSpan = el.querySelector && el.querySelector('span[title]');
        if (dateSpan) {
            const label = dateSpan.innerText.trim();
            if (/^[A-Za-z]{3} \d{1,2}$/.test(label) || /^[A-Za-z]{3} \d{1,2}, \d{4}$/.test(label) || /^(Today|Yesterday)$/i.test(label)) {
                return formatDateLabel(label);
            }
        }
        // Move to previous sibling first, then up the parent chain if no more siblings
        if (el.previousElementSibling) {
            el = el.previousElementSibling;
        } else {
            el = el.parentElement;
        }
    }
    return null;
}

// Modify autoScrollAndExtract to accept a callback
async function autoScrollAndExtract(doneCallback) {
    // Check for subscription-required message before proceeding
    const alertEl = document.querySelector('.chat-footer__alert');
    if (alertEl) {
        const text = alertEl.textContent.toLowerCase();
        if ((text.includes('to resume messaging') && text.includes('subscribe')) || text.includes('user is inactive') || text.includes('user is restricted')) {
            console.log('[OF Assistant] Skipping extraction: subscription required or user is inactive.');
            if (typeof doneCallback === 'function') doneCallback();
            return;
        }
    }
    
    // Create emergency stop button right away
    const stopButton = createEmergencyStopButton();
    
    try {
        // Check emergency stop
        checkEmergencyStop();
        
        // Try several possible selectors for the chat scroll container
        const selectors = [
            '.b-chat__messages',
            '.b-chat__messages-wrapper',
            '[class*="messages"]',
            '[class*="scroll"]'
        ];
        let chatScroll = null;
        let usedSelector = '';
        for (const sel of selectors) {
            try {
                chatScroll = document.querySelector(sel);
                if (chatScroll) {
                    usedSelector = sel;
                    break;
                }
            } catch (err) {
                console.warn(`[OF Assistant] Error finding selector ${sel}:`, err);
                // Continue with next selector
            }
        }
        if (!chatScroll) {
            console.error('[OF Assistant] Could not find chat scroll container with any selector!');
            const allMessages = Array.from(document.querySelectorAll('*')).filter(el => {
                try {
                    return el.className && el.className.toString().includes('messages');
                } catch (err) {
                    return false;
                }
            });
            console.log('[OF Assistant] Elements with "messages" in class:', allMessages);
            if (typeof doneCallback === 'function') doneCallback();
            return;
        } else {
            console.log(`[OF Assistant] Found chat scroll container with selector: ${usedSelector}`);
        }

        // Create a visual indicator
        const indicator = document.createElement('div');
        indicator.style.position = 'fixed';
        indicator.style.top = '70px';
        indicator.style.right = '20px';
        indicator.style.background = 'rgba(0, 173, 239, 0.9)';
        indicator.style.color = 'white';
        indicator.style.padding = '12px 20px';
        indicator.style.borderRadius = '8px';
        indicator.style.zIndex = '9999999';
        indicator.style.boxShadow = '0 4px 15px rgba(0,0,0,0.5)';
        indicator.style.fontSize = '16px';
        indicator.style.fontWeight = 'bold';
        indicator.style.maxWidth = '350px';
        indicator.style.pointerEvents = 'none';
        indicator.innerHTML = 'Loading chat messages...';
        document.body.appendChild(indicator);

        // Helper function to scroll to top (for loading older messages)
        function scrollToTop(element) {
            // Check for emergency stop
            if (GLOBAL_EMERGENCY_STOP) {
                console.log('[OF Assistant] Emergency stop detected in scrollToTop');
                return;
            }
            
            element.scrollTop = 0;
            // console.log(`[OF Assistant] Scrolled to TOP: scrollTop=${element.scrollTop}`);
        }

        // First, we scroll UP to load older messages
        let lastHeight = chatScroll.scrollHeight;
        let sameCount = 0;
        let maxTries = 4; // Avoid infinite loop

        try {
            console.log('[OF Assistant] Starting auto-scroll to TOP to load older messages...');
            
            // First scroll to bottom to ensure we have the newest messages
            chatScroll.scrollTop = chatScroll.scrollHeight;
            await sleep(2000); // Increased from 1000ms to ensure complete scroll
            
            // Check for emergency stop
            if (GLOBAL_EMERGENCY_STOP) {
                console.log('[OF Assistant] Emergency stop detected after initial scroll');
                throw new Error('Emergency stop activated');
            }
            
            // Now scroll up repeatedly to load older messages
            while (sameCount < 3 && maxTries-- > 0 && !GLOBAL_EMERGENCY_STOP) {
                try {
                    // Check for emergency stop at the start of each loop iteration
                    if (GLOBAL_EMERGENCY_STOP) {
                        console.log('[OF Assistant] Emergency stop detected in scroll loop');
                        break;
                    }
                    
                    // Scroll to TOP
                    scrollToTop(chatScroll);
                    indicator.innerHTML = `Loading older messages... (${maxTries} tries left)`;
                    
                    // Also try scroll events for better triggering
                    for (let i = 0; i < 5 && !GLOBAL_EMERGENCY_STOP; i++) {
                        const wheelEvent = new WheelEvent('wheel', {
                            bubbles: true,
                            cancelable: true,
                            view: window,
                            deltaY: -150 // Negative for scroll up
                        });
                        chatScroll.dispatchEvent(wheelEvent);
                        await sleep(200); // Increased from 100ms for more reliable scrolling
                    }
                    
                    // Check for emergency stop
                    if (GLOBAL_EMERGENCY_STOP) continue;
                    
                    // Wait for messages to load - increased delay
                    await sleep(2500); // Increased from 1500ms to allow more time for messages to load
                    
                    // Check for emergency stop again
                    if (GLOBAL_EMERGENCY_STOP) continue;
                    
                    // Check if content height changed (more messages loaded)
                    let currentHeight = chatScroll.scrollHeight;
                    // console.log(`[OF Assistant] Scroll progress: height ${lastHeight} → ${currentHeight}`);
                    
                    if (currentHeight === lastHeight) {
                        sameCount++;
                        indicator.innerHTML = `Checking for more messages... (${sameCount}/3)`;
                    } else {
                        sameCount = 0;
                        lastHeight = currentHeight;
                        indicator.innerHTML = `Found older messages! Continuing to scroll UP...`;
                    }
                    
                    // Check for "Load More" or "Load Previous" buttons 
                    const loadMoreButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
                        try {
                            const text = (btn.innerText || '').toLowerCase();
                            return text.includes('load') || text.includes('previous') || text.includes('earlier');
                        } catch (e) {
                            return false;
                        }
                    });
                    
                    if (loadMoreButtons.length > 0 && !GLOBAL_EMERGENCY_STOP) {
                        indicator.innerHTML = 'Clicking "Load More" button';
                        loadMoreButtons[0].click();
                        console.log('[OF Assistant] Clicked "Load More" button');
                        
                        // Wait for content to load - increased delay
                        await sleep(3500); // Increased from 2000ms to ensure content loads completely
                        
                        // Reset counter after clicking a button
                        sameCount = 0;
                    }
                    
                } catch (scrollErr) {
                    console.error('[OF Assistant] Error during scrolling to TOP:', scrollErr);
                    indicator.innerHTML = 'Error during scrolling!';
                    
                    // Check if error was due to emergency stop
                    if (GLOBAL_EMERGENCY_STOP) {
                        console.log('[OF Assistant] Scroll error was due to emergency stop');
                        break;
                    }
                    
                    // Added delay after scroll error before continuing
                    await sleep(1000);
                    
                    // Otherwise continue with next iteration
                }
            }
            
            // Check for emergency stop before scrolling to latest messages
            if (GLOBAL_EMERGENCY_STOP) {
                console.log('[OF Assistant] Emergency stop detected before final scroll');
                throw new Error('Emergency stop activated');
            }
            
            // Now scroll to the bottom to see newest messages
            indicator.innerHTML = 'Scrolling to latest messages...';
            chatScroll.scrollTop = chatScroll.scrollHeight;
            await sleep(2000); // Increased from 1000ms
            
            document.body.removeChild(indicator);
        } catch (scrollLoopErr) {
            console.error('[OF Assistant] Error in scroll loop:', scrollLoopErr);
            try {
                document.body.removeChild(indicator);
            } catch (e) {}
            
            // Check if error was due to emergency stop
            if (GLOBAL_EMERGENCY_STOP) {
                console.log('[OF Assistant] Scroll loop error was due to emergency stop');
                throw new Error('Emergency stop activated');
            }
            
            // Continue with extraction anyway if not emergency stop
        }
        
        console.log('[OF Assistant] Finished auto-scrolling, extracting messages...');

        // Extraction logic
        const results = [];
        try {
            const bodies = document.querySelectorAll('.b-chat__message__body');
            bodies.forEach(bodyEl => {
                try {
                    let time = '';
                    let sender = 'fan';
                    // Traverse up the parent elements to check for 'm-from-me'
                    let parent = bodyEl;
                    while (parent) {
                        if (parent.classList && parent.classList.contains('m-from-me')) {
                            sender = 'creator';
                            break;
                        }
                        parent = parent.parentElement;
                    }
                    const messageContainer = bodyEl.closest('.b-chat__item-message');
                    let messageDate = null;
                    if (messageContainer) {
                        try {
                            const timeSpan = messageContainer.querySelector('.b-chat__message__time, span[class*="message__time"]');
                            if (timeSpan) {
                                const rawTime = timeSpan.innerText.trim();
                                const colonIdx = rawTime.indexOf(":");
                                if (colonIdx === 1) {
                                    time = rawTime.slice(0, 7); // e.g., '3:20 am'
                                } else if (colonIdx === 2) {
                                    time = rawTime.slice(0, 8); // e.g., '13:20 am'
                                } else {
                                    time = rawTime; // fallback, use as is
                                }
                            }
                        } catch (timeErr) {
                            console.warn('[OF Assistant] Error extracting time:', timeErr);
                            time = ''; // Use empty string as fallback
                        }
                        
                        try {
                            // Find the closest date marker above this message
                            messageDate = findClosestDateElement(messageContainer);
                        } catch (dateErr) {
                            console.warn('[OF Assistant] Error finding date element:', dateErr);
                            messageDate = null; // Use null as fallback
                        }
                    }
                    
                    let paymentState = null;
                    if (messageContainer) {
                        try {
                            const paymentSpan = messageContainer.querySelector('.b-chat__message__payment-state');
                            if (paymentSpan) {
                                paymentState = paymentSpan.innerText.trim();
                            }
                        } catch (paymentErr) {
                            console.warn('[OF Assistant] Error extracting payment state:', paymentErr);
                            paymentState = null;
                        }
                    }
                    
                    try {
                        bodyEl.querySelectorAll('p').forEach(p => {
                            try {
                                const text = p.innerText.trim();
                                if (text) {
                                    // Try to find the time immediately after the text node
                                    let time = '';
                                    let paymentState = null;
                                    let next = p.nextElementSibling;
                                    while (next) {
                                        if (next.classList && next.classList.contains('b-chat__message__time')) {
                                            time = next.innerText.trim();
                                            break; // Stop after finding the first valid time
                                        }
                                        next = next.nextElementSibling;
                                    }
                                    // If not found, fallback to previous logic
                                    if (!time && messageContainer) {
                                        try {
                                            const timeSpan = messageContainer.querySelector('.b-chat__message__time, span[class*="message__time"]');
                                            if (timeSpan) {
                                                const rawTime = timeSpan.innerText.trim();
                                                const colonIdx = rawTime.indexOf(":");
                                                if (colonIdx === 1) {
                                                    time = rawTime.slice(0, 7);
                                                } else if (colonIdx === 2) {
                                                    time = rawTime.slice(0, 8);
                                                } else {
                                                    time = rawTime;
                                                }
                                            }
                                        } catch (timeErr) {
                                            time = '';
                                        }
                                    }
                                    results.push({ type: 'text', value: text, time, date: messageDate, sender, payment_state: null, url: null });
                                }
                            } catch (pErr) {
                                console.warn('[OF Assistant] Error processing paragraph:', pErr);
                            }
                        });
                    } catch (pQueryErr) {
                        console.warn('[OF Assistant] Error querying paragraphs:', pQueryErr);
                    }
                    try {
                        bodyEl.querySelectorAll('img').forEach(img => {
                            try {
                                // Try to find the payment_state and time immediately after the image node
                                let time = '';
                                let paymentState = null;
                                let next = img.nextElementSibling;
                                while (next) {
                                    if (next.classList && next.classList.contains('b-chat__message__payment-state')) {
                                        paymentState = next.innerText.trim();
                                    }
                                    if (next.classList && next.classList.contains('b-chat__message__time')) {
                                        time = next.innerText.trim();
                                        break; // Stop after finding the first valid time
                                    }
                                    next = next.nextElementSibling;
                                }
                                // If not found, fallback to previous logic
                                if ((!time || !paymentState) && messageContainer) {
                                    try {
                                        if (!time) {
                                            const timeSpan = messageContainer.querySelector('.b-chat__message__time, span[class*="message__time"]');
                                            if (timeSpan) {
                                                const rawTime = timeSpan.innerText.trim();
                                                const colonIdx = rawTime.indexOf(":");
                                                if (colonIdx === 1) {
                                                    time = rawTime.slice(0, 7);
                                                } else if (colonIdx === 2) {
                                                    time = rawTime.slice(0, 8);
                                                } else {
                                                    time = rawTime;
                                                }
                                            }
                                        }
                                        if (!paymentState) {
                                            const paymentSpan = messageContainer.querySelector('.b-chat__message__payment-state');
                                            if (paymentSpan) {
                                                paymentState = paymentSpan.innerText.trim();
                                            }
                                        }
                                    } catch (err) {}
                                }
                                // Add the url field for images
                                const messageObject = { type: 'image', value: 'Check out my photo', time, date: messageDate, sender, payment_state: paymentState };
                                if (img.src) {
                                    messageObject.url = img.src;
                                }
                                results.push(messageObject);
                            } catch (imgErr) {
                                console.warn('[OF Assistant] Error processing image:', imgErr);
                            }
                        });
                    } catch (imgQueryErr) {
                        console.warn('[OF Assistant] Error querying images:', imgQueryErr);
                    }
                } catch (messageErr) {
                    console.warn('[OF Assistant] Error processing message:', messageErr);
                    // Continue with next message
                }
            });
        } catch (extractionErr) {
            console.error('[OF Assistant] Error during message extraction:', extractionErr);
            // Continue with what we have
        }
        
        console.log('[OF Assistant] All extracted message contents:', results);

        // Extract creator name (first .g-user-name encountered, regardless of parent)
        let creator = 'unknown_creator';
        try {
            const firstGUserName = document.querySelector('.g-user-name');
            if (firstGUserName) {
                creator = firstGUserName.innerText.trim() || 'unknown_creator';
            }
        } catch (creatorErr) {
            console.warn('[OF Assistant] Error extracting creator name:', creatorErr);
        }

        // Extract fan name and chat ID (with .b-chat__header__wrapper logic)
        let fanName = 'unknown_fan';
        try {
            const gUserNames = document.querySelectorAll('.g-user-name');
            for (const el of gUserNames) {
                try {
                    let parent = el;
                    let found = false;
                    for (let i = 0; i < 8; i++) {
                        parent = parent.parentElement;
                        if (!parent) break;
                        if (parent.classList && parent.classList.contains('b-chat__header__wrapper')) {
                            // Get visible text
                            let name = el.textContent.trim();
                            // Try to get :before and :after pseudo-element content if present
                            const before = window.getComputedStyle(el, '::before').content.replace(/"/g, '');
                            const after = window.getComputedStyle(el, '::after').content.replace(/"/g, '');
                            if (before && before !== 'none') name = before + name;
                            if (after && after !== 'none') name = name + after;
                            // Remove leading/trailing brackets and normalize whitespace
                            name = name.replace(/^[\s\(\[\{]+|[\s\)\]\}]+$/g, '');
                            name = name.replace(/\s+/g, ' ');
                            fanName = name || 'unknown_fan';
                            found = true;
                            break;
                        }
                    }
                    if (found) break;
                } catch (userNameErr) {
                    console.warn('[OF Assistant] Error processing user name element:', userNameErr);
                }
            }
        } catch (fanNameErr) {
            console.warn('[OF Assistant] Error extracting fan name:', fanNameErr);
        }
        
        const chatId = window.location.href.split('/').filter(Boolean).pop();
        const fan = `${fanName}`;

        // Helper: Like the last fan message if it is the last message in the chat
        await likeLastFanMessageIfNeeded(results);

        // Send to background script for webhook and wait for response
        let webhookResult;
        try {
            // Get user email and ID directly from localStorage for guaranteed persistence
            const userEmail = localStorage.getItem('of_user_email') || null;
            const userId = localStorage.getItem('of_user_id') || null;
            
            // Log the email being used in this extraction
            // console.log('[OF Assistant] Using stored user credentials for webhook:', {
            //     email: userEmail || '(not found in localStorage)',
            //     userId: userId || '(not found in localStorage)'
            // });
            
            // Add delay before sending webhook request
            await sleep(1000); // New delay before webhook request
            
            // Send with direct user info in payload
            webhookResult = await sendToWebhook({ 
                fan, 
                creator, 
                chat_id: chatId, 
                messages: results,
                directUserEmail: userEmail, // Add directly in payload to ensure it's included
                directUserId: userId  // Add directly in payload to ensure it's included
            });
            
            // Add delay after receiving webhook response
            await sleep(1500); // New delay to ensure response is fully processed
        } catch (webhookErr) {
            console.error('[OF Assistant] Error sending to webhook:', webhookErr);
            webhookResult = { success: false, error: 'Webhook communication failed' };
        }
        
        // Print/log the actual webhook reply
        if (webhookResult.success) {
            console.log('[OF Assistant] Webhook success:', webhookResult.data);
            
            let webhookPhotoUrls = []; // Declare webhookPhotoUrls here

            // EXTREME DEBUG - log everything we can about the reply
            if (webhookResult.data && webhookResult.data.reply) {
                const rawReply = webhookResult.data.reply;
                console.log('==================== EXTREME DEBUG ====================');
                console.log('Raw reply type:', typeof rawReply);
                console.log('Raw reply:', rawReply);
                console.log('stringify(reply):', JSON.stringify(rawReply));
                
                if (typeof rawReply === 'string') {
                    console.log('First character:', rawReply.charAt(0));
                    console.log('Last character:', rawReply.charAt(rawReply.length - 1));
                    console.log('Contains [?', rawReply.includes('['));
                    console.log('Contains output?', rawReply.includes('output'));
                }
                
                console.log('==================== END DEBUG ====================');
            }
            
            // Process the webhook reply
            if (webhookResult.data && webhookResult.data.reply) {
                try {
                    // Add delay before processing webhook response
                    await sleep(1000); // New delay before processing

                    let replyText = '';
                    let sendPhoto = false;
                    let isValidFormat = false;
                    
                    // Get the raw reply
                    const rawReply = webhookResult.data.reply;
                    
                    // STRICT FORMAT VALIDATION
                    // We only accept replies that match the expected structure:
                    // - An array with two objects
                    // - First object has "output" property with the message text
                    // - Second object has "Photo_send" property with value "Yes"
                    
                    console.log('[OF Assistant] Validating webhook reply format');
                    
                    // Function to validate the array structure
                    function isValidReplyFormat(data) {
                        // Accept arrays of length 2, 3 or 4
                        if (!Array.isArray(data) || (data.length !== 2 && data.length !== 3 && data.length !== 4)) {
                            console.log('[OF Assistant] Reply is not a 2, 3, or 4-item array');
                            return false;
                        }
                        // Check for required object types regardless of order
                        const hasOutput = data.some(item => item && typeof item === 'object' && typeof item.output === 'string');
                        const hasPhotoSend = data.some(item => item && typeof item === 'object' && 'Photo_send' in item);
                        const hasStage = data.some(item => item && typeof item === 'object' && 'stage' in item);
                        const hasUrls = data.some(item => item && typeof item === 'object' && Array.isArray(item.urls));

                        // In the 4-item case, all four must be present
                        if (data.length === 4) {
                            return hasOutput && hasPhotoSend && hasStage && hasUrls;
                        }

                        // For 2 or 3 items, we check based on previous logic (output, Photo_send, Stage)
                        if (data.length === 2) {
                             if (data[0] && typeof data[0] === 'object' && typeof data[0].output === 'string' &&
                                data[1] && typeof data[1] === 'object' && ('Photo_send' in data[1] || 'stage' in data[1])) {
                                return true;
                            }
                        }
                         if (data.length === 3) {
                             if (data[0] && typeof data[0] === 'object' && typeof data[0].output === 'string' &&
                                 data[1] && typeof data[1] === 'object' && 'Photo_send' in data[1] &&
                                 data[2] && typeof data[2] === 'object' && 'stage' in data[2]) {
                                 return true;
                             }
                         }

                        return false; // Default to invalid
                    }
                    
                    // Parse the reply if it's a string
                    if (typeof rawReply === 'string') {
                        try {
                            let cleanJsonStr = rawReply
                                .replace(/\n/g, ' ')
                                .replace(/\r/g, ' ')
                                .replace(/\t/g, ' ')
                                .replace(/\"/g, '"')
                                .replace(/\\/g, '\\');
                            console.log('[OF Assistant] Cleaned JSON string:', cleanJsonStr);
                            const parsed = JSON.parse(cleanJsonStr);
                            console.log('[OF Assistant] Successfully parsed:', parsed);
                            // Log each item for debugging
                            parsed.forEach((item, idx) => console.log(`[OF Assistant] Parsed item[${idx}]:`, item));
                            // Validate the structure
                            if (isValidReplyFormat(parsed)) {
                                isValidFormat = true;
                                
                                // Extract fields using .find for flexibility in order
                                let outputObj = parsed.find(obj => obj && typeof obj === 'object' && 'output' in obj);
                                let photoSendObj = parsed.find(obj => obj && typeof obj === 'object' && 'Photo_send' in obj);
                                let stageObj = parsed.find(obj => obj && typeof obj === 'object' && 'stage' in obj);
                                let urlsObj = parsed.find(obj => obj && typeof obj === 'object' && 'urls' in obj);

                                replyText = outputObj ? outputObj.output : '';
                                sendPhoto = photoSendObj ? photoSendObj.Photo_send === "Yes" : false;
                                stageValue = stageObj ? stageObj.stage : undefined; // Store stage value
                                webhookPhotoUrls = urlsObj ? urlsObj.urls : []; // Store URLs in a variable

                                if (stageValue !== undefined) {
                                    console.log('[OF Assistant] Stage value:', stageValue);
                                }
                                console.log('[OF Assistant] Valid format confirmed. Message:', replyText, 'Send photo:', sendPhoto, 'Webhook URLs:', webhookPhotoUrls);
                                
                            } else {
                                console.warn('[OF Assistant] Invalid reply format, skipping processing');
                                // Log the raw reply for debugging when format is invalid
                                console.log('[OF Assistant] Raw webhook reply (invalid format):', rawReply);
                            }
                        } catch (parseError) {
                            console.error('[OF Assistant] Error parsing JSON:', parseError);
                            console.log('[OF Assistant] Invalid format (parse error), skipping processing');
                            // Log the raw reply for debugging on parse error
                            console.log('[OF Assistant] Raw webhook reply (parse error):', rawReply);
                        }
                    } else if (Array.isArray(rawReply)) {
                        console.log('DEBUG: parsed:', rawReply, 'typeof:', typeof rawReply);
                         if (isValidReplyFormat(rawReply)) {
                            isValidFormat = true;

                             // Extract fields using .find for flexibility in order
                             let outputObj = rawReply.find(obj => obj && typeof obj === 'object' && 'output' in obj);
                             let photoSendObj = rawReply.find(obj => obj && typeof obj === 'object' && 'Photo_send' in obj);
                             let stageObj = rawReply.find(obj => obj && typeof obj === 'object' && 'stage' in obj);
                             let urlsObj = rawReply.find(obj => obj && typeof obj === 'object' && Array.isArray(obj.urls));

                             replyText = outputObj ? outputObj.output : '';
                             sendPhoto = photoSendObj ? photoSendObj.Photo_send === "Yes" : false;
                             stageValue = stageObj ? stageObj.stage : undefined; // Store stage value
                             webhookPhotoUrls = urlsObj ? urlsObj.urls : []; // Store URLs in a variable

                             if (stageValue !== undefined) {
                                 console.log('[OF Assistant] Stage value:', stageValue);
                             }
                            console.log('[OF Assistant] Valid format confirmed from array. Message:', replyText, 'Send photo:', sendPhoto, 'Webhook URLs:', webhookPhotoUrls);

                        } else {
                            console.warn('[OF Assistant] Invalid reply array format, skipping processing');
                            // Log the raw reply for debugging when format is invalid
                            console.log('[OF Assistant] Raw webhook reply (invalid format):', rawReply);
                        }
                    } else {
                        console.warn('[OF Assistant] Reply is not a string or array, skipping processing');
                        // Log the raw reply for debugging when reply is not string or array
                        console.log('[OF Assistant] Raw webhook reply (not string/array):', rawReply);
                    }
                    
                    // Only proceed if we have a valid format and there is reply text to send
                    if (isValidFormat && replyText) {
                        const messageInput = document.querySelector('div[data-placeholder*="Type a message"]');
                        const sendButton = document.querySelector('button[at-attr="send_btn"]');

                        if (messageInput && sendButton) {
                            try {
                                // ABSOLUTELY make sure we set just the plain text
                                messageInput.innerText = replyText;
                                console.log('[OF Assistant] Set message input text:', replyText);
                                
                                // Dispatch events to ensure the page recognizes the input
                                messageInput.dispatchEvent(new Event('input', { bubbles: true }));
                                messageInput.dispatchEvent(new Event('change', { bubbles: true }));
                                
                                // Increased delay after setting message text
                                await sleep(1500); // Increased from 500ms
                                
                                try {
                                    sendButton.click();
                                    console.log('[OF Assistant] Sent text reply successfully');
                                } catch (clickErr) {
                                    console.error('[OF Assistant] Error clicking send button:', clickErr);
                                }
                                
                                // Increased delay after sending text message
                                await sleep(3000); // Increased from 1500ms
                                
                                // Handle photo sending if requested
                                if (sendPhoto) {
                                    console.log('[OF Assistant] Photo sending requested. Trying automated approach...');
                                    try {
                                        // First try the automated approach
                                        // Pass webhookPhotoUrls to sendPhotoAutomated
                                        const automatedSuccess = await sendPhotoAutomated(stageValue, webhookPhotoUrls);
                                        
                                        // Add delay after photo sending attempt regardless of result
                                        await sleep(2000); // New delay after photo sending
                                        
                                        if (!automatedSuccess) {
                                            // If automated approach fails, fall back to vault button
                                            console.log('[OF Assistant] Automated approach failed, falling back to vault button click');
                                            clickVaultButton();
                                            
                                            // Add delay after fallback vault button click
                                            await sleep(2000); // New delay after fallback
                                        }
                                    } catch (photoErr) {
                                        console.error('[OF Assistant] Error in photo sending process:', photoErr);
                                        // Still try the vault button as last resort
                                        clickVaultButton();
                                        
                                        // Add delay after emergency vault button click
                                        await sleep(2000); // New delay after emergency fallback
                                    }
                                }
                            } catch (inputErr) {
                                console.error('[OF Assistant] Error setting message input value:', inputErr);
                            }
                        } else {
                            if (!messageInput) console.warn('[OF Assistant] Could not find message input field.');
                            if (!sendButton) console.warn('[OF Assistant] Could not find send button using selector: button[at-attr="send_btn"]');
                        }
                    } else {
                        console.warn('[OF Assistant] Not processing webhook response - format validation failed');
                    }
                } catch (sendReplyErr) {
                    console.error('[OF Assistant] Error in send reply process:', sendReplyErr);
                }
            }
        } else {
            console.error('[OF Assistant] Webhook error:', webhookResult.error);
        }
    } catch (outerErr) {
        console.error('[OF Assistant] Fatal error in autoScrollAndExtract:', outerErr);
    } finally {
        // Ensure callback is always called, even after errors
        try {
            // Wait 3 seconds after webhook reply (or send attempt)
            await sleep(3000);
        } catch (err) {
            console.warn('[OF Assistant] Error in final sleep:', err);
        }
        
        if (typeof doneCallback === 'function') {
            try {
                doneCallback();
            } catch (callbackErr) {
                console.error('[OF Assistant] Error in doneCallback:', callbackErr);
            }
        }
    }
}

// Helper: Random scrolling to trigger different content loading patterns
async function randomScroll(container) {
    const scrollHeight = container.scrollHeight;
    const viewHeight = container.clientHeight;
    
    // Create a visual indicator to show scrolling is happening
    const indicator = document.createElement('div');
    indicator.style.position = 'fixed';
    indicator.style.top = '10px';
    indicator.style.right = '10px';
    indicator.style.background = 'rgba(0, 173, 239, 0.8)';
    indicator.style.color = 'white';
    indicator.style.padding = '10px 15px';
    indicator.style.borderRadius = '5px';
    indicator.style.zIndex = '9999';
    indicator.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    indicator.style.transition = 'background 0.3s';
    indicator.innerHTML = 'Scanning for chats: Pass 4 - Simulating Mouse Wheel';
    document.body.appendChild(indicator);
    
    try {
        // Use mouse wheel events to trigger lazy loading
        for (let i = 0; i < 50; i++) { // More scrolls than before
            // Update indicator with progress
            indicator.innerHTML = `Scanning for chats: Pass 4 - Mouse Wheel ${i+1}/50`;
            
            // Create and dispatch a mouse wheel event
            const wheelEvent = new WheelEvent('wheel', {
                bubbles: true,
                cancelable: true,
                deltaY: 100, // Positive scrolls down
                deltaMode: 0  // Pixel mode
            });
            container.dispatchEvent(wheelEvent);
            
            // Increased delay between wheel events
            await sleep(400); // Increased from 200ms
            
            // Every 5 wheel events, check for new links
            if (i % 5 === 0) {
                const currentLinks = extractChatLinks();
                console.log(`[OF Assistant] After ${i+1} wheel events, found ${currentLinks.length} links`);
                indicator.innerHTML = `Found ${currentLinks.length} chats (${i+1}/50)`;
                // Increased delay to let content load
                await sleep(1200); // Increased from 800ms
            }
        }
    } finally {
        // Remove the indicator when done
        document.body.removeChild(indicator);
    }
}

// Helper: Methodical scroll through container with visual feedback
async function methodicalScroll(container, direction) {
    // Create a visual indicator
    const indicator = document.createElement('div');
    indicator.style.position = 'fixed';
    indicator.style.top = '10px';
    indicator.style.right = '10px';
    indicator.style.background = 'rgba(0, 173, 239, 0.8)';
    indicator.style.color = 'white';
    indicator.style.padding = '10px 15px';
    indicator.style.borderRadius = '5px';
    indicator.style.zIndex = '9999';
    indicator.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    document.body.appendChild(indicator);
    
    try {
        if (direction === 'down') {
            // Start from the top
            smoothScrollTo(container, 0, 400);
            await sleep(3000); // Increased from 2000ms for more reliable positioning
            
            // Create a mousewheel event and trigger it repeatedly
            const totalScrolls = 100; // More thorough scrolling
            let foundChatCount = 0;
            
            for (let i = 0; i < totalScrolls; i++) {
                // Update the indicator
                indicator.innerHTML = `Scanning for chats: Pass 2 - Mouse Wheel Scroll ${i+1}/${totalScrolls}`;
                
                // Create a mouse wheel event to scroll down
                const wheelEvent = new WheelEvent('wheel', {
                    bubbles: true,
                    cancelable: true,
                    deltaY: 80, // Smaller delta for more gradual scrolling
                    deltaMode: 0 // Pixel mode
                });
                
                // Dispatch event to simulate mouse wheel scrolling
                container.dispatchEvent(wheelEvent);
                
                // Increased wait for content to load
                await sleep(500); // Increased from 300ms
                
                // Every 10 scrolls, check for new chat links
                if (i % 10 === 0) {
                    const currentLinks = extractChatLinks();
                    const newCount = currentLinks.length;
                    
                    console.log(`[OF Assistant] After ${i+1} methodical wheel events, found ${newCount} links`);
                    
                    if (newCount > foundChatCount) {
                        // Found new chats, highlight this
                        indicator.style.background = 'rgba(0, 200, 0, 0.8)';
                        indicator.innerHTML = `Found ${newCount} chats! Continuing...`;
                        foundChatCount = newCount;
                        
                        // Increased wait to let more content load
                        await sleep(1500); // Increased from 1000ms
                        indicator.style.background = 'rgba(0, 173, 239, 0.8)';
                    }
                }
            }
        }
    } finally {
        // Remove indicator when done
        document.body.removeChild(indicator);
    }
}

// Helper function to extract all visible chat links
function extractVisibleChatLinks() {
    const chatUrls = [];
    
    try {
        // Find all links on the page
        const allLinks = document.querySelectorAll('a');
        
        for (const link of allLinks) {
            try {
                if (!link.href) continue;
                
                // Check if this is a chat link
                if (link.href.includes('/my/chats/chat/') || link.href.includes('/chats/chat/')) {
                    // Extract chat ID and standardize URL
                    const chatIdMatch = link.href.match(/\/chat\/(\d+)/);
                    if (chatIdMatch && chatIdMatch[1]) {
                        const chatId = chatIdMatch[1];
                        const standardUrl = `https://onlyfans.com/my/chats/chat/${chatId}/`;
                        
                        // Only add if not already in list
                        if (!chatUrls.includes(standardUrl)) {
                            chatUrls.push(standardUrl);
                        }
                    }
                }
            } catch (err) {
                // Skip problematic links
            }
        }
        
        // If nothing found, try direct HTML parsing
        if (chatUrls.length === 0) {
            const html = document.documentElement.outerHTML;
            const chatIdMatches = html.match(/\/chat\/(\d+)/g) || [];
            
            chatIdMatches.forEach(match => {
                const chatId = match.split('/').pop();
                if (chatId && /^\d+$/.test(chatId)) {
                    const standardUrl = `https://onlyfans.com/my/chats/chat/${chatId}/`;
                    if (!chatUrls.includes(standardUrl)) {
                        chatUrls.push(standardUrl);
                    }
                }
            });
        }
    } catch (err) {
        console.error('[OF Assistant] Error extracting chat links:', err);
    }
    
    return chatUrls;
}

// Utility to smoothly scroll to specific position
function smoothScrollTo(element, position, duration = 500) {
    if (!element) return;
    
    const start = element.scrollTop;
    const change = position - start;
    let startTime = null;
    
    function animateScroll(currentTime) {
        if (startTime === null) startTime = currentTime;
        const elapsed = currentTime - startTime;
        
        // Easing function: easeInOutQuad
        let progress = elapsed / duration;
        progress = Math.min(1, progress);
        progress = progress < 0.5 
            ? 2 * progress * progress 
            : -1 + (4 - 2 * progress) * progress;
        
        element.scrollTop = start + change * progress;
        
        if (elapsed < duration) {
            window.requestAnimationFrame(animateScroll);
        }
    }
    
    window.requestAnimationFrame(animateScroll);
}

// Helper: Extract chat links - used internally by methodicalScroll
function extractChatLinks() {
    const links = [];
    document.querySelectorAll('a[href*="/my/chats/chat/"]').forEach(link => {
        const href = link.href;
        if (href && !links.includes(href)) {
            links.push(href);
        }
    });
    return links;
}

// Setup for testing
async function testWebhookConnection() {
    try {
        const testOverlay = document.createElement('div');
        testOverlay.style.position = 'fixed';
        testOverlay.style.top = '20px';
        testOverlay.style.left = '20px';
        testOverlay.style.background = 'rgba(0, 0, 0, 0.8)';
        testOverlay.style.color = 'white';
        testOverlay.style.padding = '15px 20px';
        testOverlay.style.borderRadius = '8px';
        testOverlay.style.zIndex = '9999999';
        testOverlay.style.fontSize = '16px';
        testOverlay.style.fontWeight = 'bold';
        testOverlay.style.pointerEvents = 'none';
        testOverlay.innerHTML = 'Testing webhook connection...';
        document.body.appendChild(testOverlay);
        
        const testPayload = {
            test: true,
            timestamp: new Date().toISOString(),
            agent: 'OnlyFans Message Assistant'
        };
        
        const result = await sendToWebhook(testPayload);
        
        if (result.success) {
            testOverlay.style.background = 'rgba(0, 150, 0, 0.8)';
            testOverlay.innerHTML = 'Webhook connection successful!';
            console.log('[OF Assistant] Webhook test successful:', result.data);
        } else {
            testOverlay.style.background = 'rgba(220, 0, 0, 0.8)';
            testOverlay.innerHTML = 'Webhook connection failed!';
            console.error('[OF Assistant] Webhook test failed:', result.error);
        }
        
        setTimeout(() => {
            document.body.removeChild(testOverlay);
        }, 3000);
        
        return result.success;
    } catch (err) {
        console.error('[OF Assistant] Error testing webhook:', err);
        return false;
    }
}

// Run a test when extension loads in dev mode
if (MODE === 'test' && window.location.pathname === '/my/chats/') {
    setTimeout(() => {
        testWebhookConnection();
    }, 5000);
}


// Add a special function to handle stuck scenarios - runs on page load
(function addStuckHelper() {
    // Only run this on the chat list page when we've found chats but might be stuck
    if (window.location.href.includes('/my/chats/') && 
        !window.location.href.includes('/my/chats/chat/') &&
        localStorage.getItem('of_chat_urls')) {
        
        try {
            const urls = JSON.parse(localStorage.getItem('of_chat_urls') || '[]');
            if (urls.length === 0) return; // No chats found, nothing to do
            
            console.log('[OF Assistant] STUCK DETECTION: Adding helper UI for stuck scenario');
            
            // Create a floating helper panel
            const stuckHelper = document.createElement('div');
            stuckHelper.style.position = 'fixed';
            stuckHelper.style.top = '20%';
            stuckHelper.style.left = '50%';
            stuckHelper.style.transform = 'translate(-50%, -50%)';
            stuckHelper.style.background = 'rgba(255, 0, 0, 0.95)';
            stuckHelper.style.color = 'white';
            stuckHelper.style.padding = '25px 30px';
            stuckHelper.style.borderRadius = '15px';
            stuckHelper.style.zIndex = '99999999';
            stuckHelper.style.fontSize = '20px';
            stuckHelper.style.fontWeight = 'bold';
            stuckHelper.style.boxShadow = '0 0 30px rgba(0, 0, 0, 0.7)';
            stuckHelper.style.border = '3px solid white';
            stuckHelper.style.textAlign = 'center';
            stuckHelper.style.maxWidth = '500px';
            
            stuckHelper.innerHTML = `
                <div style="font-size: 40px; margin-bottom: 15px;">🚨 STUCK DETECTED 🚨</div>
                <p style="margin-bottom: 20px;">The extraction process appears to be stuck on the chat list page.</p>
                <p style="margin-bottom: 15px;">Found <strong>${urls.length}</strong> chats to process.</p>
                <p style="margin-bottom: 20px; font-size: 16px;">First chat: ${urls[0]}</p>
            `;
            
            // Add "Force Start" button 
            const forceStartButton = document.createElement('button');
            forceStartButton.textContent = '🚀 FORCE START EXTRACTION';
            forceStartButton.style.padding = '15px 25px';
            forceStartButton.style.backgroundColor = '#00adef';
            forceStartButton.style.color = 'white';
            forceStartButton.style.border = 'none';
            forceStartButton.style.borderRadius = '10px';
            forceStartButton.style.fontSize = '20px';
            forceStartButton.style.fontWeight = 'bold';
            forceStartButton.style.cursor = 'pointer';
            forceStartButton.style.marginBottom = '15px';
            forceStartButton.style.width = '100%';
            
            forceStartButton.addEventListener('click', function() {
                try {
                    console.log('[OF Assistant] User clicked FORCE START button from stuck detector');
                    
                    // Set forced extraction flag
                    localStorage.setItem('of_force_extraction', 'true');
                    
                    // Navigate to the first chat
                    if (urls.length > 0) {
                        console.log(`[OF Assistant] Forcing navigation to first chat: ${urls[0]}`);
                        
                        // Clean up UI first
                        document.querySelectorAll('div[style*="position: fixed"]').forEach(el => {
                            try { if (el.parentNode) el.parentNode.removeChild(el); } catch(e) {}
                        });
                        
                        // Force navigation with multiple methods
                        window.location.href = urls[0];
                        
                        setTimeout(() => {
                            window.location.replace(urls[0]);
                        }, 500);
                    }
                } catch (e) {
                    console.error('[OF Assistant] Error in force start:', e);
                    alert('Error starting extraction. Please try refreshing the page.');
                }
            });
            
            // Add Reset button
            const resetButton = document.createElement('button');
            resetButton.textContent = '🗑️ RESET & START OVER';
            resetButton.style.padding = '15px 25px';
            resetButton.style.backgroundColor = '#ff6b6b';
            resetButton.style.color = 'white';
            resetButton.style.border = 'none';
            resetButton.style.borderRadius = '10px';
            resetButton.style.fontSize = '18px';
            resetButton.style.fontWeight = 'bold';
            resetButton.style.cursor = 'pointer';
            resetButton.style.width = '100%';
            
            resetButton.addEventListener('click', function() {
                try {
                    console.log('[OF Assistant] User clicked RESET button from stuck detector');
                    
                    // Clear all localStorage data
                    localStorage.removeItem('of_chat_urls');
                    localStorage.removeItem('of_chat_index');
                    localStorage.removeItem('of_force_extraction');
                    
                    // Show confirmation
                    stuckHelper.innerHTML = `
                        <div style="font-size: 40px; margin-bottom: 15px;">✅ RESET COMPLETE</div>
                        <p style="margin-bottom: 20px;">All data has been cleared.</p>
                        <p style="margin-bottom: 20px;">Reloading page in 2 seconds...</p>
                    `;
                    
                    // Reload page after a short delay
                    setTimeout(() => {
                        window.location.reload();
                    }, 2000);
                } catch (e) {
                    console.error('[OF Assistant] Error in reset:', e);
                    alert('Error resetting. Please try refreshing the page manually.');
                }
            });
            
            // Add buttons to the helper
            stuckHelper.appendChild(forceStartButton);
            stuckHelper.appendChild(resetButton);
            
            // Add dismiss button
            const dismissButton = document.createElement('button');
            dismissButton.textContent = '❌';
            dismissButton.style.position = 'absolute';
            dismissButton.style.top = '10px';
            dismissButton.style.right = '10px';
            dismissButton.style.background = 'transparent';
            dismissButton.style.color = 'white';
            dismissButton.style.border = 'none';
            dismissButton.style.fontSize = '20px';
            dismissButton.style.cursor = 'pointer';
            
            dismissButton.addEventListener('click', function() {
                if (stuckHelper.parentNode) {
                    stuckHelper.parentNode.removeChild(stuckHelper);
                }
            });
            
            stuckHelper.appendChild(dismissButton);
            
            // Add to page
            document.body.appendChild(stuckHelper);
            
            // Add pulsing animation to make it more noticeable
            const pulseStyle = document.createElement('style');
            pulseStyle.textContent = `
                @keyframes stuckPulse {
                    0% { transform: translate(-50%, -50%) scale(1); }
                    50% { transform: translate(-50%, -50%) scale(1.03); }
                    100% { transform: translate(-50%, -50%) scale(1); }
                }
            `;
            document.head.appendChild(pulseStyle);
            stuckHelper.style.animation = 'stuckPulse 2s infinite';
            
            // Auto-dismiss after 5 minutes
            setTimeout(() => {
                try {
                    if (stuckHelper.parentNode) {
                        stuckHelper.parentNode.removeChild(stuckHelper);
                    }
                } catch (e) {}
            }, 300000);
            
        } catch (err) {
            console.error('[OF Assistant] Error adding stuck helper:', err);
        }
    }
})();

// Helper function to send a photo from the vault - SIMPLIFIED VERSION FOCUSING ONLY ON VAULT BUTTON
async function sendPhotoFromVault() {
    console.log('[OF Assistant] Starting simplified vault button process');
    
    // Create a visual debug indicator
    const debugIndicator = document.createElement('div');
    debugIndicator.style.position = 'fixed';
    debugIndicator.style.top = '100px';
    debugIndicator.style.right = '20px';
    debugIndicator.style.background = 'rgba(255, 0, 0, 0.9)';
    debugIndicator.style.color = 'white';
    debugIndicator.style.padding = '15px 20px';
    debugIndicator.style.borderRadius = '8px';
    debugIndicator.style.zIndex = '99999999';
    debugIndicator.style.fontSize = '16px';
    debugIndicator.style.fontWeight = 'bold';
    debugIndicator.style.boxShadow = '0 0 20px rgba(0, 0, 0, 0.5)';
    debugIndicator.style.maxWidth = '400px';
    debugIndicator.innerHTML = 'Starting vault button process...';
    document.body.appendChild(debugIndicator);
    
    try {
        // STEP 1: Focus just on finding and clicking the vault button
        debugIndicator.innerHTML = 'Looking for vault button...';
        
        // Use the exact button element from the screenshot with all attributes
        console.log('[OF Assistant] Looking for vault button with exact attributes');
        
        // Try multiple methods to ensure we find the button
        let vaultButton = null;
        
        // Method 1: By at-attr attribute (primary method)
        vaultButton = document.querySelector('button[at-attr="add_vault_media"]');
        
        // Debug output of found button
        if (vaultButton) {
            console.log('[OF Assistant] Found vault button by at-attr:', {
                element: vaultButton,
                className: vaultButton.className,
                ariaLabel: vaultButton.getAttribute('aria-label')
            });
        } else {
            console.log('[OF Assistant] Could not find button by at-attr="add_vault_media"');
        }
        
        // Method 2: By aria-label (backup)
        if (!vaultButton) {
            const buttons = document.querySelectorAll('button');
            for (const btn of buttons) {
                const ariaLabel = btn.getAttribute('aria-label');
                if (ariaLabel === 'Add media from vault') {
                    vaultButton = btn;
                    console.log('[OF Assistant] Found vault button by aria-label');
                    break;
                }
            }
        }
        
        // Method 3: By icon name (fallback)
        if (!vaultButton) {
            const vaultIcon = document.querySelector('svg[data-icon-name="icon-vault"]');
            if (vaultIcon) {
                vaultButton = vaultIcon.closest('button');
                console.log('[OF Assistant] Found vault button via icon');
            }
        }
        
        // Log all buttons if we didn't find it
        if (!vaultButton) {
            console.error('[OF Assistant] Could not find vault button with any method');
            debugIndicator.innerHTML = 'ERROR: Could not find vault button';
            
            const buttons = document.querySelectorAll('button');
            console.log(`[OF Assistant] Found ${buttons.length} buttons on page:`);
            
            let buttonData = [];
            for (let i = 0; i < Math.min(buttons.length, 15); i++) {
                const btn = buttons[i];
                buttonData.push({
                    index: i,
                    className: btn.className,
                    attributes: {
                        'at-attr': btn.getAttribute('at-attr'),
                        'aria-label': btn.getAttribute('aria-label'),
                        'data-v': btn.getAttribute('data-v'),
                        'type': btn.getAttribute('type')
                    },
                    hasVaultIcon: !!btn.querySelector('svg[data-icon-name="icon-vault"]'),
                    visible: btn.offsetParent !== null
                });
            }
            
            console.table(buttonData);
            
            // Show indicator for longer then throw
            setTimeout(() => {
                if (debugIndicator.parentNode) {
                    debugIndicator.parentNode.removeChild(debugIndicator);
                }
            }, 5000);
            
            throw new Error('Could not find vault button');
        }
        
        // Now try to click the button
        debugIndicator.innerHTML = 'Found vault button, attempting to click it...';
        console.log('[OF Assistant] Attempting to click vault button');
        
        // Direct click attempt
        vaultButton.click();
        console.log('[OF Assistant] Clicked vault button directly');
        
        // Wait to see if modal appears
        debugIndicator.innerHTML = 'Clicked vault button, waiting for modal...';
        await sleep(2000);
        
        // Just report success for now - we'll add the modal handling in the next step
        debugIndicator.innerHTML = 'SUCCESS: Vault button clicked!';
        debugIndicator.style.background = 'rgba(0, 150, 0, 0.9)';
        
        // Remove indicator after success
        setTimeout(() => {
            if (debugIndicator.parentNode) {
                debugIndicator.parentNode.removeChild(debugIndicator);
            }
        }, 3000);
        
        return true;
    } catch (err) {
        console.error('[OF Assistant] Error in simplified vault process:', err);
        
        // Update indicator with error
        debugIndicator.innerHTML = `ERROR: ${err.message || 'Unknown error'}`;
        
        // Remove the indicator after 5 seconds
        setTimeout(() => {
            if (debugIndicator.parentNode) {
                debugIndicator.parentNode.removeChild(debugIndicator);
            }
        }, 5000);
        
        return false;
    }
}

// EXTREMELY SIMPLIFIED function that ONLY clicks the vault button
function clickVaultButton() {
    console.log('[OF Assistant] DIRECT vault button click attempt');
    
    // Create visual indicator
    const indicator = document.createElement('div');
    indicator.style.position = 'fixed';
    indicator.style.top = '100px';
    indicator.style.right = '20px';
    indicator.style.background = 'rgba(255, 0, 0, 0.9)';
    indicator.style.color = 'white';
    indicator.style.padding = '15px 20px';
    indicator.style.borderRadius = '8px';
    indicator.style.zIndex = '99999999';
    indicator.style.fontSize = '16px';
    indicator.style.fontWeight = 'bold';
    indicator.innerHTML = 'Clicking vault button...';
    document.body.appendChild(indicator);
    
    try {
        // Add initial delay before searching for button
        setTimeout(async () => {
            // Try several methods to find the vault button
            let vaultButton = null;
            
            // Method 1: By attribute (main method shown in screenshot)
            vaultButton = document.querySelector('button[at-attr="add_vault_media"]');
            if (vaultButton) {
                console.log('[OF Assistant] Found vault button by at-attr');
            }
            
            // Method 2: By icon and traversing up to find button
            if (!vaultButton) {
                const vaultIcons = document.querySelectorAll('svg[data-icon-name="icon-vault"]');
                console.log(`[OF Assistant] Found ${vaultIcons.length} vault icons`);
                
                for (const icon of vaultIcons) {
                    // First try closest button
                    let button = icon.closest('button');
                    if (button) {
                        vaultButton = button;
                        console.log('[OF Assistant] Found vault button via icon.closest()');
                        break;
                    }
                    
                    // If closest fails, manually traverse up the DOM
                    let parent = icon.parentElement;
                    for (let i = 0; i < 5 && parent; i++) {
                        if (parent.tagName === 'BUTTON') {
                            vaultButton = parent;
                            console.log('[OF Assistant] Found vault button via manual parent traversal');
                            break;
                        }
                        
                        // If we find an element with role="button", that works too
                        if (parent.getAttribute('role') === 'button') {
                            vaultButton = parent;
                            console.log('[OF Assistant] Found vault button via role="button"');
                            break;
                        }
                        
                        parent = parent.parentElement;
                    }
                    
                    if (vaultButton) break;
                }
            }
            
            // Method 3: By broader button search
            if (!vaultButton) {
                // Try all buttons that might be media/attachment related
                const allButtons = document.querySelectorAll('button');
                console.log(`[OF Assistant] Searching through ${allButtons.length} buttons`);
                
                for (const btn of allButtons) {
                    // Check for common attachment button traits
                    const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                    const atAttr = (btn.getAttribute('at-attr') || '').toLowerCase();
                    const btnText = (btn.textContent || '').toLowerCase();
                    const hasVaultIcon = !!btn.querySelector('svg[data-icon-name="icon-vault"]');
                    const hasPhotoIcon = !!btn.querySelector('svg[data-icon-name*="photo"], svg[data-icon-name*="media"], svg[data-icon-name*="image"]');
                    
                    if (hasVaultIcon || 
                        hasPhotoIcon || 
                        ariaLabel.includes('vault') || 
                        ariaLabel.includes('media') || 
                        ariaLabel.includes('photo') || 
                        ariaLabel.includes('attach') ||
                        atAttr.includes('vault') ||
                        atAttr.includes('media') ||
                        btnText.includes('vault')) {
                        
                        vaultButton = btn;
                        console.log('[OF Assistant] Found potential vault button by broad criteria:', {
                            ariaLabel, atAttr, hasVaultIcon, hasPhotoIcon
                        });
                        break;
                    }
                }
            }
            
            // Add delay before clicking button
            await sleep(1000); // New delay before clicking
            
            // Check if we found a button
            if (vaultButton) {
                // Log detailed info about the button we found
                console.log('[OF Assistant] Found vault button:', {
                    tagName: vaultButton.tagName,
                    className: vaultButton.className,
                    ariaLabel: vaultButton.getAttribute('aria-label'),
                    atAttr: vaultButton.getAttribute('at-attr'),
                    rect: vaultButton.getBoundingClientRect()
                });
                
                // Make sure it's visible before clicking
                if (vaultButton.offsetParent !== null) {
                    // CLICK IT!
                    vaultButton.click();
                    console.log('[OF Assistant] Clicked vault button!');
                    indicator.innerHTML = 'Vault button clicked!';
                    indicator.style.background = 'rgba(0, 150, 0, 0.9)';
                    
                    // Added delay before trying backup click event
                    await sleep(1000); // New delay
                    
                    // Try click event as backup
                    try {
                        vaultButton.dispatchEvent(new MouseEvent('click', {
                            bubbles: true,
                            cancelable: true,
                            view: window
                        }));
                    } catch (clickErr) {
                        console.log('[OF Assistant] Backup click event error:', clickErr);
                    }
                } else {
                    console.error('[OF Assistant] Found vault button but it appears to be hidden/not in DOM');
                    indicator.innerHTML = 'Found vault button but it appears to be hidden';
                    
                    // Try force-clicking it anyway
                    vaultButton.click();
                }
            } else {
                // Last resort: Click ANY button that might be related to attachments/media
                const possibleMediaButtons = Array.from(document.querySelectorAll('button')).filter(btn => {
                    // Check for typical position of attachment buttons
                    const rect = btn.getBoundingClientRect();
                    // Media buttons are typically at the bottom of the chat, to the left of the text area
                    const isAtBottom = rect.bottom > window.innerHeight - 100;
                    return isAtBottom && rect.width > 20 && rect.height > 20;
                });
                
                console.log(`[OF Assistant] Last resort: Found ${possibleMediaButtons.length} possible media buttons at bottom of page`);
                
                if (possibleMediaButtons.length > 0) {
                    // Added delay before last resort click
                    await sleep(1000); // New delay
                    
                    // Try to click each button starting from left to right (first are usually media buttons)
                    possibleMediaButtons.sort((a, b) => 
                        a.getBoundingClientRect().left - b.getBoundingClientRect().left
                    );
                    
                    const firstButton = possibleMediaButtons[0];
                    firstButton.click();
                    console.log('[OF Assistant] Clicked first possible media button as last resort');
                    indicator.innerHTML = 'Clicked possible media button (last resort)';
                    indicator.style.background = 'rgba(255, 165, 0, 0.9)';
                } else {
                    console.error('[OF Assistant] Could not find any potential vault/media buttons');
                    indicator.innerHTML = 'Could not find any vault/media buttons';
                }
            }
            
            // Remove indicator after longer delay
            setTimeout(() => {
                if (indicator.parentNode) {
                    indicator.parentNode.removeChild(indicator);
                }
            }, 5000); // Increased from 3000ms
        }, 1500); // New initial delay before starting button search
    } catch (err) {
        console.error('[OF Assistant] Error clicking vault button:', err);
        indicator.innerHTML = `Error: ${err.message}`;
        
        // Remove indicator after error with delay
        setTimeout(() => {
            if (indicator.parentNode) {
                indicator.parentNode.removeChild(indicator);
            }
        }, 5000); // Increased from 3000ms
    }
}

// Helper function to send photos programmatically using a different approach
async function sendPhotoAutomated(stage, webhookPhotoUrls) {
    console.log('[OF Assistant] Starting photo selection process with all 3 steps');
    
    // Create visual indicator
    const indicator = document.createElement('div');
    indicator.style.position = 'fixed';
    indicator.style.top = '100px';
    indicator.style.right = '20px';
    indicator.style.background = 'rgba(0, 0, 255, 0.9)';
    indicator.style.color = 'white';
    indicator.style.padding = '15px 20px';
    indicator.style.borderRadius = '8px';
    indicator.style.zIndex = '99999999';
    indicator.style.fontSize = '16px';
    indicator.style.fontWeight = 'bold';
    indicator.innerHTML = 'Starting photo selection...';
    document.body.appendChild(indicator);
    
    try {
        // STEP 1: Click the vault button to open the panel
        console.log('[OF Assistant] STEP 1: Clicking vault button');
        indicator.innerHTML = 'STEP 1: Clicking vault button...';
        
        // Find and click the vault button
        const vaultButton = document.querySelector('button[at-attr="add_vault_media"]');
        if (vaultButton) {
            console.log('[OF Assistant] Found vault button by at-attr, clicking it');
            vaultButton.click();
        } else {
            console.log('[OF Assistant] Could not find vault button by at-attr, using fallback method');
            // Fallback method
            clickVaultButton();
        }
        
        // Wait for panel to open
        await sleep(3000);
        console.log('[OF Assistant] Waiting for vault panel to open');

        console.log('STEP 2A starting. stage:', stage);
        
        // STEP 2A: Click the correct STAGE folder in the sidebar if stage is provided
        let extractedPrice = null;
        if (stage !== undefined && stage !== null) {
            console.log(`[OF Assistant] Step 2A: Scrolling sidebar to bottom to load all folders...`);
            // Use the correct scrollable sidebar container
            let sidebar = document.querySelector('.l-sidebar-column__scroll-section__inner');
            if (!sidebar) {
                sidebar = document.querySelector('.b-rows-lists');
                if (sidebar) {
                    console.log('[OF Assistant] Fallback: using .b-rows-lists as sidebar:', sidebar);
                }
            }
            if (!sidebar) {
                // fallback: try parent of a folder row
                const anyRow = document.querySelector('.b-rows-lists__item__text[role="button"]');
                if (anyRow && anyRow.parentElement) {
                    sidebar = anyRow.parentElement;
                    console.log('[OF Assistant] Fallback: using parent of a folder row as sidebar:', sidebar);
                }
            }
            if (!sidebar) {
                console.warn('[OF Assistant] Could not find sidebar container (.l-sidebar-column__scroll-section or .b-rows-lists) for STAGE folder scrolling!');
            } else {
                // Scroll all the way to the bottom in one jump
                sidebar.scrollTop = sidebar.scrollHeight;
                console.log(`[OF Assistant] Scrolled sidebar to bottom: scrollTop=${sidebar.scrollTop}, scrollHeight=${sidebar.scrollHeight}`);
                await sleep(1200); // Wait for lazy loading

                let found = false;
                const folderRows = document.querySelectorAll('.b-rows-lists__item__text[role="button"]');
                for (const row of folderRows) {
                    const nameEl = row.querySelector('.b-rows-lists__item__name.g-text-ellipsis');
                    const folderName = nameEl ? nameEl.textContent.trim() : '';
                    console.log(`[OF Assistant] Step 2A: Checking row: '${folderName}'`);
                    if (folderName.toUpperCase().startsWith('STAGE' + String(stage).toUpperCase())) {
                        console.log(`[OF Assistant] Step 2A: Clicking folder row: '${folderName}'`);
                        row.click();
                        await sleep(1500);
                        // Extract price after $ sign
                        const dollarIdx = folderName.indexOf('$');
                        if (dollarIdx !== -1) {
                            extractedPrice = folderName.substring(dollarIdx + 1).replace(/[^0-9.]/g, '');
                            console.log(`[OF Assistant] Extracted price from folder: ${extractedPrice}`);
                        }
                        found = true;
                        break;
                    }
                }
                if (!found) {
                    console.warn(`[OF Assistant] Could not find STAGE${stage} folder after scrolling to bottom.`);
                }
            }
        }
        // Step 3: Now click the Photo tab as before
        let foundPhotoTab = false;
        const photoTab = document.querySelector('.Photo');
        if (photoTab) {
            console.log('[OF Assistant] Found Photo tab by .Photo class, clicking it');
            photoTab.click();
            foundPhotoTab = true;
        } else {
            const allButtons = document.querySelectorAll('button');
            for (const btn of allButtons) {
                if (btn.textContent && btn.textContent.trim() === 'Photo') {
                    console.log('[OF Assistant] Found button with exact Photo text');
                    btn.click();
                    foundPhotoTab = true;
                    break;
                }
            }
            if (!foundPhotoTab) {
                const possibleTabs = document.querySelectorAll('.All, .b-tabs__nav__item, .GIF, .Video, .Audio');
                for (const tab of possibleTabs) {
                    if (tab.textContent && tab.textContent.includes('Photo')) {
                        console.log('[OF Assistant] Found tab containing Photo text');
                        tab.click();
                        foundPhotoTab = true;
                        break;
                    }
                }
            }
        }
        if (foundPhotoTab) {
            indicator.innerHTML = 'STEP 3: Clicked Photo tab - Complete!';
            indicator.style.background = 'rgba(0, 150, 0, 0.9)';
        } else {
            indicator.innerHTML = 'Photo tab not found, continuing...';
            indicator.style.background = 'rgba(255, 165, 0, 0.9)';
        }
        
        // Wait for photos to load after tab click - increased delay
        await sleep(3000); // Increased from 1500ms for more reliable photo loading
        
        // STEP 3: Find the photo gallery container and select a photo
        console.log('[OF Assistant] STEP 3: Finding photo gallery...');
        indicator.innerHTML = 'STEP 3: Finding photo gallery...';
        
        // TARGETING THE EXACT CONTAINER FROM SCREENSHOT
        // The screenshot shows a container with class "g-sides-gaps h-100 flex-fill m-native-custom-scrollbar m-scrollbar-y m-invisible-scrollbar"
        let photoContainer = null;
        
        // Exact selector from screenshot 
        const exactSelectors = [
            'div.g-sides-gaps.h-100.flex-fill.m-native-custom-scrollbar.m-scrollbar-y.m-invisible-scrollbar',
            'div[class*="g-sides-gaps"][class*="h-100"][class*="flex-fill"][class*="m-native-custom-scrollbar"]',
            'div.b-content-filter.d-flex.flex-grow.align-items-start.position-relative',
            'div.b-vault-media.g-negative-sides-gaps'
        ];
        
        for (const selector of exactSelectors) {
            try {
                const container = document.querySelector(selector);
                if (container) {
                    photoContainer = container;
                    console.log(`[OF Assistant] Found photo container with exact selector: ${selector}`);
                    break;
                }
            } catch (e) {
                console.log(`[OF Assistant] Error with selector ${selector}:`, e);
            }
        }
        
        // If exact selectors failed, try different approaches
        if (!photoContainer) {
            console.log('[OF Assistant] Exact selectors failed, trying alternative methods');
            
            // Look for elements with key classes from screenshot
            const classMatches = [
                'g-sides-gaps',
                'm-native-custom-scrollbar',
                'm-scrollbar-y',
                'flex-fill',
                'h-100'
            ];
            
            const allDivs = document.querySelectorAll('div');
            for (const div of allDivs) {
                try {
                    const className = div.className || '';
                    if (typeof className === 'string') {
                        let matchCount = 0;
                        for (const classMatch of classMatches) {
                            if (className.includes(classMatch)) {
                                matchCount++;
                            }
                        }
                        
                        if (matchCount >= 2) {
                            photoContainer = div;
                            console.log(`[OF Assistant] Found photo container with ${matchCount} matching classes: ${className}`);
                            break;
                        }
                    }
                } catch (e) {}
            }
        }
        
        // If still no container, try to locate based on photos/images inside
        if (!photoContainer) {
            console.log('[OF Assistant] Trying to find container based on photo content');
            
            // Find elements that contain multiple images
            const allElements = document.querySelectorAll('*');
            let bestElement = null;
            let maxImages = 0;
            
            for (const el of allElements) {
                try {
                    const images = el.querySelectorAll('img');
                    if (images.length > maxImages) {
                        maxImages = images.length;
                        bestElement = el;
                    }
                } catch (e) {}
            }
            
            if (bestElement && maxImages > 3) {
                photoContainer = bestElement;
                console.log(`[OF Assistant] Found container with ${maxImages} images inside`);
            }
        }
        
        // Check if we found the container
        if (!photoContainer) {
            console.log('[OF Assistant] Failed to find specific photo container.');
            indicator.innerHTML = 'Could not find photo container. Skipping photo selection.';
            indicator.style.background = 'rgba(255, 0, 0, 0.9)'; // Indicate error
            // We cannot proceed with photo selection if the container is not found
            // You might want to add more robust error handling here, 
            // like returning false or throwing a specific error.
            // For now, we'll simply exit this block and potentially continue 
            // with later steps if they don't depend on a selected photo.
            return false; // Indicate that photo selection failed

        } else {
            console.log('[OF Assistant] Successfully found photo container:', photoContainer);
            indicator.innerHTML = 'Found photo container, proceeding to photo selection...';
            
            // IMPORTANT: Scroll all the way to the bottom first to load all photos
            console.log('[OF Assistant] Starting thorough scrolling to load ALL photos before selection');
            indicator.innerHTML = 'Loading all photos...';
            
            // More aggressive scrolling to ensure we reach the bottom
            let scrollAttempts = 0;
            const maxScrollAttempts = 10; // Increase max attempts to ensure we load everything
            let lastScrollPosition = 0;
            let samePositionCount = 0;
            
            // Scroll to the bottom repeatedly until we can't scroll further
            while (scrollAttempts < maxScrollAttempts && samePositionCount < 3) {
                scrollAttempts++;
                
                // First try scrolling to the absolute bottom
                photoContainer.scrollTop = photoContainer.scrollHeight;
                console.log(`[OF Assistant] Scrolled to position ${photoContainer.scrollTop}/${photoContainer.scrollHeight}`);
                
                // Also use wheel events to trigger any lazy loading
                try {
                    const wheelEvent = new WheelEvent('wheel', {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        deltaY: 500 // Larger delta for bigger jumps
                    });
                    photoContainer.dispatchEvent(wheelEvent);
                } catch (e) {}
                
                // Wait for content to load
                await sleep(2000);
                
                // Check if we've reached the bottom
                if (photoContainer.scrollTop === lastScrollPosition) {
                    samePositionCount++;
                    console.log(`[OF Assistant] Same scroll position detected (${samePositionCount}/3)`);
                } else {
                    samePositionCount = 0;
                    lastScrollPosition = photoContainer.scrollTop;
                }
                
                indicator.innerHTML = `Loading photos: scroll ${scrollAttempts}/${maxScrollAttempts}`;
            }
            
            console.log('[OF Assistant] Finished scrolling to load all photos');
            
            // Now find all photo checkboxes and select one
            console.log('[OF Assistant] Searching for photos with checkboxes and selecting one...');
            indicator.innerHTML = 'Finding photos to select...';

            const photoItems = photoContainer.querySelectorAll('div.b-photos__item.m-square'); // Target elements containing photos within the container using updated selector
            // Array to store objects containing both the checkbox element and the photo URL
            const selectablePhotos = [];
            
            photoItems.forEach(item => {
                // Check if a checkbox exists within this photo item
                const checkbox = item.querySelector('.checkbox-item__inside');
                const img = item.querySelector('img');
                
                if (checkbox && img && img.src) {
                    selectablePhotos.push({ checkbox: checkbox, url: img.src });
                }
            });
            
            console.log(`[OF Assistant] Found ${photoItems.length} photo items in container.`);
            console.log(`[OF Assistant] Found ${selectablePhotos.length} photos with checkboxes in container.`);
            console.log('[OF Assistant] URLs of photos with checkboxes:', selectablePhotos.map(photo => photo.url));
            
            // Filter out photos that have already been sent based on webhookPhotoUrls
            const availablePhotos = selectablePhotos.filter(photo => {
                const photoUrl = photo.url;
                const isSent = webhookPhotoUrls.some(sentUrl => {
                    // Compare only the first 50 characters
                    const photoUrlSubstring = photoUrl.substring(0, 50);
                    const sentUrlSubstring = sentUrl.substring(0, 50);
                    const isMatch = photoUrlSubstring === sentUrlSubstring;
                    
                    // Log the comparison
                    if (isMatch) {
                        console.log(`[OF Assistant] Comparing: ${photoUrlSubstring}... with ${sentUrlSubstring}... - Match found (already sent)`);
                    } else {
                        console.log(`[OF Assistant] Comparing: ${photoUrlSubstring}... with ${sentUrlSubstring}... - No match`);
                    }
                    
                    return isMatch;
                });
                // Keep the photo if it has NOT been sent
                return !isSent;
            });

            console.log(`[OF Assistant] Found ${selectablePhotos.length} total selectable photos.`);
            console.log(`[OF Assistant] ${selectablePhotos.length - availablePhotos.length} photos already sent.`);
            console.log(`[OF Assistant] ${availablePhotos.length} photos available to send.`);
            
            indicator.innerHTML = `Found ${selectablePhotos.length} photos. ${availablePhotos.length} available.`;

            // Now select a random photo from the available ones
            if (availablePhotos.length > 0) {
                const randomIndex = Math.floor(Math.random() * availablePhotos.length);
                const selectedPhoto = availablePhotos[randomIndex];
                const selectedCheckbox = selectedPhoto.checkbox;
                const selectedPhotoUrl = selectedPhoto.url;
                
                console.log(`[OF Assistant] Selected photo #${randomIndex} out of ${availablePhotos.length} available photos.`);
                console.log('[OF Assistant] Selected Photo URL:', selectedPhotoUrl);
                
                try {
                    // Click the checkbox of the selected photo
                    selectedCheckbox.click();
                    console.log('[OF Assistant] Clicked the selected photo checkbox.');
                    indicator.innerHTML = `Selected photo #${randomIndex}.`;
                    await sleep(1500); // Wait for selection UI to update
                } catch (e) {
                    console.error('[OF Assistant] Error clicking selected photo checkbox:', e);
                    // Try clicking the parent element if direct click fails
                    try {
                        if (selectedCheckbox.parentElement) {
                            selectedCheckbox.parentElement.click();
                            console.log('[OF Assistant] Clicked parent of selected checkbox.');
                        }
                    } catch (parentErr) {
                        console.error('[OF Assistant] Error clicking parent of selected checkbox:', parentErr);
                    }
                }
            } else {
                console.warn('[OF Assistant] No available photos to send after filtering.');
                indicator.innerHTML = 'No new photos to select.';
                // Indicate failure for photo selection part
                return false; // Indicate that photo selection failed because no new photos were available
            }

            // Indicate successful photo selection step
            indicator.innerHTML = 'Photo selected successfully. Proceeding...';
            indicator.style.background = 'rgba(0, 150, 0, 0.9)';
             // No need to scroll back to top here, already done before finding checkboxes

        } // End of if (photoContainer) else block

        // STEP 4: Look for and click the ADD button
        console.log('[OF Assistant] STEP 4: Looking for ADD button');
        indicator.innerHTML = 'Looking for ADD button...';
        
        const addButtonSelectors = [
            'button.ADD',
            'button.g-btn.m-reset-width.m-rounded.m-sm',
            'button[class*="m-reset-width"]',
            'button[class*="m-rounded"]',
            'button[class*="m-sm"]',
            'button.add'
        ];
        
        let addButton = null;
        
        // First look for a button with exactly "ADD" text
        const allButtons = document.querySelectorAll('button');
        for (const btn of allButtons) {
            try {
                const text = (btn.textContent || '').trim();
                if (text === 'ADD') {
                    addButton = btn;
                    console.log('[OF Assistant] Found ADD button by exact text match');
                    break;
                }
            } catch (e) {}
        }
        
        // If not found by text, try selectors
        if (!addButton) {
            for (const selector of addButtonSelectors) {
                try {
                    const buttons = document.querySelectorAll(selector);
                    for (const btn of buttons) {
                        const text = (btn.textContent || '').trim().toLowerCase();
                        if (text === 'add' || text.includes('add')) {
                            addButton = btn;
                            console.log(`[OF Assistant] Found add button with selector: ${selector}`);
                            break;
                        }
                    }
                    if (addButton) break;
                } catch (e) {
                    console.log(`[OF Assistant] Error with button selector ${selector}:`, e);
                }
            }
        }
        
        // If still not found, look for blue buttons
        if (!addButton) {
            console.log('[OF Assistant] Still no add button found, looking for blue buttons');
            
            // In the screenshot, the ADD button is blue
            const possibleButtons = document.querySelectorAll('button[style*="background"], button[class*="btn"]');
            
            // Find a blue colored button
            for (const btn of possibleButtons) {
                try {
                    // Check for blue-like colors in computed style
                    const style = window.getComputedStyle(btn);
                    const backgroundColor = style.backgroundColor;
                    
                    if (backgroundColor && (
                        backgroundColor.includes('rgb(0, 132, 255)') || 
                        backgroundColor.includes('rgb(30, 144, 255)') ||
                        backgroundColor.includes('rgb(0, 122, 255)')
                    )) {
                        addButton = btn;
                        console.log(`[OF Assistant] Found potential add button by blue color`);
                        break;
                    }
                } catch (e) {}
            }
        }
        
        // Click the ADD button if found
        if (addButton) {
            try {
                addButton.click();
                console.log('[OF Assistant] Clicked ADD button');
                indicator.innerHTML = 'Photo added successfully!';
                indicator.style.background = 'rgba(0, 150, 0, 0.95)';
                
                // Wait for the modal to close and photo to be added to message - increased delay
                await sleep(2500); // Increased from 1000ms to ensure modal fully closes
                
                // STEP 5: Handle the price button and price setting modal - ONLY ONCE
                console.log('[OF Assistant] STEP 5: Looking for price button');
                indicator.innerHTML = 'Setting message price...';
                
                // Look for the price button using selectors from screenshots
                const priceButtonSelectors = [
                    'button[at-attr="price_btn"]',
                    'button[class*="price"]',
                    'button[class*="g-btn"][class*="with-round-hover"]',
                    'button[aria-label*="price"]',
                    'button.g-btn.m-with-round-hover',
                    'button[type="button"][at-attr="price_btn"]'
                ];
                
                let priceButton = null;
                for (const selector of priceButtonSelectors) {
                    try {
                        const buttons = document.querySelectorAll(selector);
                        for (const btn of buttons) {
                            const text = (btn.textContent || '').trim().toLowerCase();
                            const ariaLabel = (btn.getAttribute('aria-label') || '').toLowerCase();
                            if (text.includes('price') || ariaLabel.includes('price') || btn.querySelector('svg[data-icon-name="icon-price"]')) {
                                priceButton = btn;
                                console.log(`[OF Assistant] Found price button with selector: ${selector}`);
                                break;
                            }
                        }
                        if (priceButton) break;
                    } catch (e) {
                        console.log(`[OF Assistant] Error with price button selector ${selector}:`, e);
                    }
                }
                
                // If still not found, try all buttons with a more general approach
                if (!priceButton) {
                    console.log('[OF Assistant] No specific price button found, trying all buttons');
                    const allButtons = document.querySelectorAll('button');
                    for (const btn of allButtons) {
                        try {
                            // Check button properties
                            const html = btn.outerHTML || '';
                            const text = (btn.textContent || '').toLowerCase();
                            
                            if (html.includes('price') || text.includes('price') || 
                                btn.querySelector('svg[data-icon-name*="price"]')) {
                                priceButton = btn;
                                console.log('[OF Assistant] Found possible price button:', {
                                    text: text,
                                    html: html.substring(0, 50) + '...'
                                });
                                break;
                            }
                        } catch (e) {}
                    }
                }
                
                // Click the price button if found
                if (priceButton) {
                    priceButton.click();
                    console.log('[OF Assistant] Clicked price button');
                    indicator.innerHTML = 'Opened price modal';
                    
                    // Wait for price modal to open - increased delay
                    await sleep(3000); // Increased from 1500ms
                    
                    // STEP 6: Set the price in the input field and click SAVE
                    console.log('[OF Assistant] STEP 6: Setting price in modal');
                    
                    // Look for price input field
                    const priceInputSelectors = [
                        'input#priceInput_138',
                        'input[id*="priceInput"]',
                        'input[inputmode="decimal"]',
                        'input[placeholder="Free"]',
                        'input[class*="v-input"]',
                        'input[name*="price"]',
                        'input.v-text-field__slot input'
                    ];
                    
                    let priceInput = null;
                    for (const selector of priceInputSelectors) {
                        try {
                            const input = document.querySelector(selector);
                            if (input) {
                                priceInput = input;
                                console.log(`[OF Assistant] Found price input with selector: ${selector}`);
                                break;
                            }
                        } catch (e) {
                            console.log(`[OF Assistant] Error with price input selector ${selector}:`, e);
                        }
                    }
                    
                    // If still not found, look through all inputs
                    if (!priceInput) {
                        const allInputs = document.querySelectorAll('input');
                        for (const input of allInputs) {
                            try {
                                const placeholder = (input.getAttribute('placeholder') || '').toLowerCase();
                                const id = (input.id || '').toLowerCase();
                                const name = (input.name || '').toLowerCase();
                                
                                if (placeholder.includes('free') || id.includes('price') || name.includes('price') ||
                                    input.closest('div[id*="ModalPostPrice"]')) {
                                    priceInput = input;
                                    console.log('[OF Assistant] Found price input through attributes');
                                    break;
                                }
                            } catch (e) {}
                        }
                    }
                    
                    // Enter price value if input found
                    if (priceInput) {
                        // Clear the input first (in case it has a default value)
                        priceInput.value = '';
                        
                        // Use extractedPrice if available, else fallback to localStorage or default
                        const photoCost = extractedPrice || localStorage.getItem('of_photo_cost') || '9.8';
                        priceInput.value = photoCost;
                        console.log('[OF Assistant] Set price value to:', photoCost);
                        
                        // Trigger input events to ensure the UI updates
                        priceInput.dispatchEvent(new Event('input', { bubbles: true }));
                        priceInput.dispatchEvent(new Event('change', { bubbles: true }));
                        priceInput.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
                        
                        // Wait a moment for UI to update
                        await sleep(500);
                        
                        // Now find and click the SAVE button
                        const saveButtonSelectors = [
                            'button.SAVE',
                            'button[class*="m-flat m-btn-gaps m-reset-width"]',
                            'button:contains("Save")', 
                            'button[class*="g-btn m-flat"]'
                        ];
                        
                        let saveButton = null;
                        
                        // First try by text content
                        const modalButtons = document.querySelectorAll('button');
                        for (const btn of modalButtons) {
                            try {
                                const text = (btn.textContent || '').trim();
                                if (text === 'Save') {
                                    saveButton = btn;
                                    console.log('[OF Assistant] Found Save button by exact text');
                                    break;
                                }
                            } catch (e) {}
                        }
                        
                        // If not found by text, try selectors
                        if (!saveButton) {
                            for (const selector of saveButtonSelectors) {
                                try {
                                    const buttons = document.querySelectorAll(selector);
                                    if (buttons.length > 0) {
                                        // If multiple buttons, prefer the one that says "Save"
                                        for (const btn of buttons) {
                                            if ((btn.textContent || '').trim() === 'Save') {
                                                saveButton = btn;
                                                break;
                                            }
                                        }
                                        
                                        // If no button with "Save" text, take the first one
                                        if (!saveButton) {
                                            saveButton = buttons[0];
                                        }
                                        
                                        console.log(`[OF Assistant] Found Save button with selector: ${selector}`);
                                        break;
                                    }
                                } catch (e) {
                                    console.log(`[OF Assistant] Error with Save button selector ${selector}:`, e);
                                }
                            }
                        }
                        
                        // If still not found, try to find the button within the modal footer
                        if (!saveButton) {
                            try {
                                const modalFooter = document.querySelector('.modal-footer, [id*="modal_footer"], footer');
                                if (modalFooter) {
                                    const footerButtons = modalFooter.querySelectorAll('button');
                                    for (const btn of footerButtons) {
                                        if ((btn.textContent || '').trim() === 'Save') {
                                            saveButton = btn;
                                            console.log('[OF Assistant] Found Save button in modal footer');
                                            break;
                                        }
                                    }
                                    
                                    // If still not found but we found footer buttons, assume the right-most button is Save
                                    if (!saveButton && footerButtons.length >= 2) {
                                        // In most UIs the primary action (Save) is on the right
                                        saveButton = footerButtons[footerButtons.length - 1];
                                        console.log('[OF Assistant] Using right-most footer button as Save');
                                    }
                                }
                            } catch (e) {
                                console.log('[OF Assistant] Error finding modal footer:', e);
                            }
                        }
                        
                        // Click the Save button if found
                        if (saveButton) {
                            saveButton.click();
                            console.log('[OF Assistant] Clicked Save button');
                            indicator.innerHTML = 'Price set, preparing to send...';
                            
                            // Wait for modal to close
                            await sleep(1000);
                            
                            // STEP 7: Finally, click the SEND button to send the message with photo and price
                            console.log('[OF Assistant] STEP 7: Clicking final SEND button');
                            const finalSendButton = document.querySelector('button[at-attr="send_btn"], button.SEND, button.g-btn.b-chat__btn-submit');
                            if (finalSendButton) {
                                finalSendButton.click();
                                console.log('[OF Assistant] Clicked SEND button');
                                indicator.innerHTML = 'Message with photo sent!';
                                indicator.style.background = 'rgba(0, 150, 0, 0.95)';
                            } else {
                                console.log('[OF Assistant] Could not find SEND button');
                                indicator.innerHTML = 'Could not find SEND button';
                                indicator.style.background = 'rgba(255, 165, 0, 0.9)';
                                
                                // Try looking for a blue SEND button at the bottom of the chat
                                try {
                                    const allButtons = document.querySelectorAll('button');
                                    for (const btn of allButtons) {
                                        const rect = btn.getBoundingClientRect();
                                        const isAtBottom = rect.bottom > window.innerHeight - 150;
                                        const textContent = (btn.textContent || '').toLowerCase();
                                        
                                        if (isAtBottom && (textContent.includes('send') || btn.classList.contains('b-chat__btn-submit'))) {
                                            btn.click();
                                            console.log('[OF Assistant] Found and clicked SEND button at bottom');
                                            indicator.innerHTML = 'Message with photo sent!';
                                            indicator.style.background = 'rgba(0, 150, 0, 0.95)';
                                            break;
                                        }
                                    }
                                } catch (e) {
                                    console.log('[OF Assistant] Error in final SEND button search:', e);
                                }
                            }
                        } else {
                            console.log('[OF Assistant] Could not find Save button');
                            indicator.innerHTML = 'Could not find Save button';
                            indicator.style.background = 'rgba(255, 165, 0, 0.9)';
                        }
                    } else {
                        console.log('[OF Assistant] Could not find price input field');
                        indicator.innerHTML = 'Could not find price input';
                        indicator.style.background = 'rgba(255, 165, 0, 0.9)';
                    }
                } else {
                    console.log('[OF Assistant] Could not find price button');
                    indicator.innerHTML = 'Could not find price button';
                    indicator.style.background = 'rgba(255, 165, 0, 0.9)';
                    
                    // Continue to try sending without price
                    const finalSendButton = document.querySelector('button[at-attr="send_btn"]');
                    if (finalSendButton) {
                        finalSendButton.click();
                        console.log('[OF Assistant] Clicked SEND button (without setting price)');
                        indicator.innerHTML = 'Message sent without price!';
                    }
                }
            } catch (e) {
                console.log('[OF Assistant] Error clicking add button:', e);
                indicator.innerHTML = 'Error clicking ADD button';
                indicator.style.background = 'rgba(255, 0, 0, 0.9)';
            }
        } else {
            console.log('[OF Assistant] Could not find ADD button');
            indicator.innerHTML = 'Could not find ADD button';
            indicator.style.background = 'rgba(255, 165, 0, 0.9)';
            
            // Try one last method - click by coordinates
            try {
                // The button is in the bottom right of the modal
                const modalFooter = document.querySelector('.modal-footer, [class*="footer"], footer');
                if (modalFooter) {
                    const rect = modalFooter.getBoundingClientRect();
                    const x = rect.right - 30; // 30px from right edge
                    const y = rect.bottom - 20; // 20px from bottom edge
                    
                    // Create and dispatch a click event at these coordinates
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true,
                        cancelable: true,
                        view: window,
                        clientX: x,
                        clientY: y
                    });
                    
                    document.elementFromPoint(x, y).dispatchEvent(clickEvent);
                    console.log(`[OF Assistant] Attempted click at x=${x}, y=${y}`);
                    indicator.innerHTML = 'Tried clicking at ADD button position';
                    
                    // Wait a moment to see if this worked
                    await sleep(1000);
                    
                    // Look for the price button directly 
                    const priceButton = document.querySelector('button[at-attr="price_btn"], button[class*="price"]');
                    if (priceButton) {
                        console.log('[OF Assistant] Found price button after coordinate click, continuing with price setting');
                        // Don't duplicate the chain, just click the price button to continue
                        priceButton.click();
                        // Rest of the price setting logic would go here but we're avoiding duplication
                    }
                }
            } catch (coordErr) {
                console.log('[OF Assistant] Error in coordinate click:', coordErr);
            }
        }
        
        // Success - completed all steps
        setTimeout(() => {
            if (indicator.parentNode) indicator.parentNode.removeChild(indicator);
        }, 5000);
        
        return true;
        
    } catch (err) {
        console.error('[OF Assistant] Error in photo selection process:', err);
        indicator.innerHTML = `Error: ${err.message}`;
        indicator.style.background = 'rgba(255, 0, 0, 0.9)';
        
        setTimeout(() => {
            if (indicator.parentNode) indicator.parentNode.removeChild(indicator);
        }, 3000);
        
        return false;
    }
}

// Helper: Like the last fan message if it is the last message in the chat
async function likeLastFanMessageIfNeeded(results) {
    console.log('[OF Assistant] likeLastFanMessageIfNeeded called.');
    if (!results || !results.length) {
        console.log('[OF Assistant] No results array provided or empty.');
        return;
    }
    console.log(`[OF Assistant] Total extracted messages: ${results.length}`);
    const bodies = Array.from(document.querySelectorAll('.b-chat__message__body'));
    if (!bodies.length) {
        console.log('[OF Assistant] No .b-chat__message__body elements found in DOM.');
        return;
    }
    console.log(`[OF Assistant] Total .b-chat__message__body elements in DOM: ${bodies.length}`);

    // Find the last fan message in the DOM
    let lastFanBody = null;
    let lastFanIndex = -1;
    for (let i = bodies.length - 1; i >= 0; i--) {
        const messageContainer = bodies[i].closest('.b-chat__item-message');
        if (messageContainer && !messageContainer.classList.contains('m-from-me')) {
            lastFanBody = bodies[i];
            lastFanIndex = i;
            console.log(`[OF Assistant] Found last fan message at DOM index ${i}.`);
            break;
        }
    }
    if (!lastFanBody) {
        console.log('[OF Assistant] No fan message found to like.');
        return;
    }

    // Log the last fan message's text content
    console.log(`[OF Assistant] Last fan message DOM index: ${lastFanIndex}`);
    console.log('[OF Assistant] Last fan message text:', lastFanBody.innerText);
    const lastFanContainer = lastFanBody.closest('.b-chat__item-message');
    if (lastFanContainer) {
        console.log('[OF Assistant] Last fan message container classes:', lastFanContainer.className);
    }

    // Check if this is the last message in the chat
    if (lastFanIndex !== bodies.length - 1) {
        const lastBody = bodies[bodies.length - 1];
        const lastContainer = lastBody.closest('.b-chat__item-message');
        let lastSender = 'unknown';
        if (lastContainer) {
            lastSender = lastContainer.classList.contains('m-from-me') ? 'creator' : 'fan';
        }
        console.log(`[OF Assistant] Last fan message is NOT the last message in the chat. Last message sender: ${lastSender}`);
        return;
    } else {
        console.log('[OF Assistant] Last fan message IS the last message in the chat. Proceeding to like.');
    }

    // Find the last element with class 'b-dropdown-dots-wrapper has-tooltip'
    const allDots = Array.from(document.querySelectorAll('.b-dropdown-dots-wrapper.has-tooltip'));
    if (!allDots.length) {
        console.warn('[OF Assistant] No .b-dropdown-dots-wrapper.has-tooltip elements found in DOM.');
        return;
    }
    const dotsElement = allDots[allDots.length - 1];
    console.log('[OF Assistant] Found last b-dropdown-dots-wrapper.has-tooltip element:', dotsElement);
    // Get the bounding rect for dropdown matching
    const btnRect = dotsElement.getBoundingClientRect();
    const btnCenter = { x: btnRect.left + btnRect.width / 2, y: btnRect.top + btnRect.height / 2 };
    // Click the element
    dotsElement.click();
    console.log('[OF Assistant] Clicked last b-dropdown-dots-wrapper.has-tooltip element. Waiting for dropdown...');

    // Randomize: 50% chance to proceed with liking
    const shouldLike = Math.random() < 0.5;
    console.log(`[OF Assistant] Random like decision: ${shouldLike ? 'Proceeding to like.' : 'Skipping like this time.'}`);
    if (!shouldLike) {
        return;
    }

    // Track dropdowns before click
    const dropdownsBefore = Array.from(document.querySelectorAll('.b-dropdown-wrapper, ul[role=menu], div[role=menu]'));

    // Wait for a new dropdown to appear (up to 1s, polling every 100ms)
    let newDropdown = null;
    for (let i = 0; i < 10; i++) {
        const dropdownsAfter = Array.from(document.querySelectorAll('.b-dropdown-wrapper, ul[role=menu], div[role=menu]'));
        // Find all new dropdowns
        const newDropdowns = dropdownsAfter.filter(dd => !dropdownsBefore.includes(dd) && dd.offsetParent !== null);
        if (newDropdowns.length > 0) {
            // Find the dropdown closest to the button
            let minDist = Infinity;
            let closestDropdown = null;
            newDropdowns.forEach((dd, idx) => {
                const rect = dd.getBoundingClientRect();
                const ddCenter = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
                const dist = Math.sqrt(Math.pow(ddCenter.x - btnCenter.x, 2) + Math.pow(ddCenter.y - btnCenter.y, 2));
                console.log(`[OF Assistant] Dropdown candidate ${idx}: center=(${ddCenter.x},${ddCenter.y}), dist=${dist}`);
                if (dist < minDist) {
                    minDist = dist;
                    closestDropdown = dd;
                }
            });
            newDropdown = closestDropdown;
            console.log('[OF Assistant] Closest new dropdown selected:', newDropdown, 'Distance:', minDist);
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!newDropdown) {
        console.warn('[OF Assistant] No new dropdown appeared after clicking dots');
        return;
    }
    // Now look for the Like button in this new dropdown
    const likeButton = Array.from(newDropdown.querySelectorAll('button.dropdown-item'))
        .find(btn => btn.textContent && btn.textContent.trim().toLowerCase() === 'like');
    if (likeButton) {
        console.log('[OF Assistant] Like button found in new dropdown, clicking:', likeButton);
        likeButton.click();
        // Add a visual indicator for debugging
        const indicator = document.createElement('div');
        indicator.style.position = 'fixed';
        indicator.style.top = '120px';
        indicator.style.right = '20px';
        indicator.style.background = 'rgba(0, 200, 0, 0.9)';
        indicator.style.color = 'white';
        indicator.style.padding = '10px 20px';
        indicator.style.borderRadius = '8px';
        indicator.style.zIndex = '99999999';
        indicator.style.fontSize = '16px';
        indicator.style.fontWeight = 'bold';
        indicator.innerHTML = '👍 Liked last fan message!';
        document.body.appendChild(indicator);
        await new Promise(resolve => setTimeout(resolve, 800));
        if (indicator.parentNode) indicator.parentNode.removeChild(indicator);
        console.log('[OF Assistant] Like action completed.');
    } else {
        console.warn('[OF Assistant] Like button not found in new dropdown');
        // Log all dropdown items for debugging
        const allDropdownItems = Array.from(newDropdown.querySelectorAll('button.dropdown-item'));
        allDropdownItems.forEach((btn, idx) => {
            console.log(`[OF Assistant] Dropdown item ${idx}: text=\"${btn.textContent.trim()}\"`, btn);
        });
    }
}
