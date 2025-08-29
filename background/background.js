const MODE = 'live'; // Change to 'live' for processing all chats
// const MODE = 'test'; // Change to 'live' for processing all chats


const N8N_WEBHOOK_URL = MODE === 'test'
? 'http://51.20.18.153:5678/webhook-test/75f639c8-5cc7-406a-9fdd-17f6fc03ee63'
: 'http://51.20.18.153:5678/webhook/75f639c8-5cc7-406a-9fdd-17f6fc03ee63';
  

// --- Supabase REST API helpers ---
const SUPABASE_URL = 'https://lukruajlqwxzklipmtzs.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1a3J1YWpscXd4emtsaXBtdHpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDY4OTA5OTIsImV4cCI6MjA2MjQ2Njk5Mn0.4TueT6cJuDJxzxYKehKra_JCJ_yTJgWvnNvhqjxYsRc';

async function supabaseInsert(table, data) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=representation'
        },
        body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.message || JSON.stringify(json));
    return json[0];
}

async function supabaseSelect(table, match) {
    const params = new URLSearchParams();
    for (const key in match) params.append(key, `eq.${match[key]}`);
    params.append('limit', 1);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params.toString()}`, {
        headers: {
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
        }
    });
    const json = await res.json();
    return json[0] || null;
}

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'sendMessage') {
        // Get the user's email from the session before sending to webhook
        chrome.storage.local.get(['supabaseSession'], (session) => {
            const userEmail = session?.supabaseSession?.user?.email || null;
            const userId = session?.supabaseSession?.user?.id || null;
            
            // POST the creator_name, fan_name, message, and user info to the n8n webhook
            fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    creator_name: request.creator_name, 
                    fan_name: request.fan_name, 
                    message: request.message,
                    userEmail,
                    userId
                })
            })
            .then(async (response) => {
                const data = await response.json();
                if (data.success) {
                    sendResponse({ success: true, message: data.message });
                } else {
                    sendResponse({ success: false, error: data.message || 'n8n error' });
                }
            })
            .catch(error => {
                sendResponse({ success: false, error: error.message });
            });
        });
        // Indicate async response
        return true;
    } else if (request.type === 'sendToWebhook') {
        // Get the user's email from the session before sending to webhook
        chrome.storage.local.get(['supabaseSession'], (session) => {
            // Use email/userId from payload if they exist, otherwise from session
            const userEmail = request.payload.userEmail || session?.supabaseSession?.user?.email || null;
            const userId = request.payload.userId || session?.supabaseSession?.user?.id || null;

            // Add email and userId to the payload only if not already present
            const enhancedPayload = { 
                ...request.payload,
                userEmail, // This won't overwrite an existing value due to our logic above
                userId     // This won't overwrite an existing value due to our logic above
            };
            
            // Log what we're sending for debugging
            console.log('[OF Assistant BG] Sending webhook payload with user info:', {
                userEmail,
                userId
            });

            fetch(N8N_WEBHOOK_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(enhancedPayload)
            })
            .then(async (response) => {
                const data = await response.json();
                sendResponse({ success: true, data });
            })
            .catch(err => {
                sendResponse({ success: false, error: err.toString() });
            });
        });
        return true; // THIS KEEPS THE PORT OPEN
    } else if (request.type === 'getCreatorName') {
        // Get the current user from Supabase auth (if available)
        chrome.storage.local.get(['supabaseSession'], (session) => {
            const userId = session?.supabaseSession?.user?.id;
            if (!userId) {
                sendResponse({ success: false, error: 'No user session' });
                return;
            }
            supabaseSelect('users', { id: userId })
                .then(user => {
                    sendResponse({ success: true, creatorName: user?.onlyfans_username || '' });
                })
                .catch(err => {
                    sendResponse({ success: false, error: err.toString() });
                });
        });
        return true;
    } else if (request.type === 'openPopup') {
        chrome.action.openPopup();
    } else if (request.type === 'open-login') {
        console.log('Received open-login message');
        const loginUrl = chrome.runtime.getURL('popup/login.html');
        console.log('Opening login window at:', loginUrl);
        chrome.windows.create({
            url: loginUrl,
            type: 'popup',
            width: 400,
            height: 400
        });
    } else if (request.type === 'storeChatData') {
        const { fanUsername, chatUrl, messages, userEmail, userId } = request;
        
        // Debug: Print the data being received
        console.log('[OF Assistant] Received storeChatData:', {
            fanUsername,
            chatUrl,
            messages,
            userEmail,
            userId
        });
        
        // Send the chat data to the webhook
        fetch(N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'chat_data',
                fanUsername,
                chatUrl,
                messages,
                userEmail,
                userId,
                timestamp: new Date().toISOString()
            })
        })
        .then(async (response) => {
            try {
                const data = await response.json();
                console.log('[OF Assistant] Webhook response for chat data:', data);
                sendResponse({ success: true, data });
            } catch (error) {
                console.error('[OF Assistant] Error parsing webhook response:', error);
                sendResponse({ success: false, error: 'Failed to parse webhook response' });
            }
        })
        .catch(error => {
            console.error('[OF Assistant] Error sending chat data to webhook:', error);
            sendResponse({ success: false, error: error.toString() });
        });
        
        return true; // async
    }
    return true;
}); 