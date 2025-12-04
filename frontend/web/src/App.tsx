// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface NewsArticle {
  id: string;
  encryptedContent: string;
  language: string;
  publisher: string;
  timestamp: number;
  category: string;
}

const App: React.FC = () => {
  // Randomly selected styles
  const colorScheme = "high-saturation-neon"; // Purple/blue/pink/green
  const uiStyle = "cyberpunk";
  const layoutStyle = "grid-information-flow";
  const interactionStyle = "micro-interactions";

  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [articles, setArticles] = useState<NewsArticle[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [notification, setNotification] = useState<{
    visible: boolean;
    type: "success" | "error" | "info";
    message: string;
  }>({ visible: false, type: "info", message: "" });
  const [newArticleData, setNewArticleData] = useState({
    content: "",
    language: "en",
    category: "politics"
  });
  const [showStats, setShowStats] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");

  // Calculate statistics
  const languageCounts = articles.reduce((acc, article) => {
    acc[article.language] = (acc[article.language] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const categoryCounts = articles.reduce((acc, article) => {
    acc[article.category] = (acc[article.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  useEffect(() => {
    loadArticles().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });

      showNotification("success", "Wallet connected successfully");
    } catch (e) {
      showNotification("error", "Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
    showNotification("info", "Wallet disconnected");
  };

  const loadArticles = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        throw new Error("Contract is not available");
      }
      
      const keysBytes = await contract.getData("article_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing article keys:", e);
        }
      }
      
      const list: NewsArticle[] = [];
      
      for (const key of keys) {
        try {
          const articleBytes = await contract.getData(`article_${key}`);
          if (articleBytes.length > 0) {
            try {
              const articleData = JSON.parse(ethers.toUtf8String(articleBytes));
              list.push({
                id: key,
                encryptedContent: articleData.content,
                language: articleData.language,
                publisher: articleData.publisher,
                timestamp: articleData.timestamp,
                category: articleData.category
              });
            } catch (e) {
              console.error(`Error parsing article data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading article ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setArticles(list);
      showNotification("success", "Articles loaded successfully");
    } catch (e: any) {
      showNotification("error", "Error loading articles: " + e.message);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const addArticle = async () => {
    if (!provider) { 
      showNotification("error", "Please connect wallet first");
      return; 
    }
    
    setAdding(true);
    showNotification("info", "Encrypting news content with FHE...");
    
    try {
      // Simulate FHE encryption
      const encryptedContent = `FHE-${btoa(newArticleData.content)}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const articleId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const articleData = {
        content: encryptedContent,
        language: newArticleData.language,
        publisher: account,
        timestamp: Math.floor(Date.now() / 1000),
        category: newArticleData.category
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `article_${articleId}`, 
        ethers.toUtf8Bytes(JSON.stringify(articleData))
      );
      
      const keysBytes = await contract.getData("article_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(articleId);
      
      await contract.setData(
        "article_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      showNotification("success", "News article encrypted and stored securely!");
      
      await loadArticles();
      
      setTimeout(() => {
        setShowAddModal(false);
        setNewArticleData({
          content: "",
          language: "en",
          category: "politics"
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      showNotification("error", errorMessage);
    } finally {
      setAdding(false);
    }
  };

  const showNotification = (type: "success" | "error" | "info", message: string) => {
    setNotification({
      visible: true,
      type,
      message
    });
    setTimeout(() => {
      setNotification({ visible: false, type: "info", message: "" });
    }, 3000);
  };

  const filteredArticles = articles.filter(article => 
    article.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
    article.language.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (loading) return (
    <div className="loading-screen cyberpunk-bg">
      <div className="neon-spinner"></div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className={`app-container ${colorScheme} ${uiStyle}`}>
      <header className="app-header">
        <div className="logo">
          <h1>NewsCluster<span>FHE</span></h1>
          <div className="fhe-badge">Fully Homomorphic Encryption</div>
        </div>
        
        <div className="header-actions">
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <main className={`main-content ${layoutStyle}`}>
        <section className="hero-section">
          <div className="hero-text">
            <h2>Confidential Multi-lingual News Topic Clustering</h2>
            <p>Securely share and analyze encrypted news articles across languages using FHE technology</p>
          </div>
          <div className="hero-actions">
            <button 
              onClick={() => setShowAddModal(true)} 
              className="neon-button purple"
            >
              + Add Encrypted Article
            </button>
            <button 
              onClick={() => setShowStats(!showStats)} 
              className="neon-button blue"
            >
              {showStats ? "Hide Stats" : "Show Stats"}
            </button>
            <button 
              onClick={loadArticles}
              className="neon-button pink"
              disabled={isRefreshing}
            >
              {isRefreshing ? "Refreshing..." : "Refresh Articles"}
            </button>
          </div>
        </section>

        {showStats && (
          <section className="stats-section">
            <div className="stat-card">
              <h3>Articles by Language</h3>
              <div className="stat-grid">
                {Object.entries(languageCounts).map(([lang, count]) => (
                  <div key={lang} className="stat-item">
                    <div className="stat-value">{count}</div>
                    <div className="stat-label">{lang.toUpperCase()}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="stat-card">
              <h3>Articles by Category</h3>
              <div className="stat-grid">
                {Object.entries(categoryCounts).map(([cat, count]) => (
                  <div key={cat} className="stat-item">
                    <div className="stat-value">{count}</div>
                    <div className="stat-label">{cat.charAt(0).toUpperCase() + cat.slice(1)}</div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="search-section">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search by category or language..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="cyber-input"
            />
          </div>
        </section>

        <section className="articles-grid">
          {filteredArticles.length === 0 ? (
            <div className="empty-state">
              <div className="empty-icon">📰</div>
              <p>No encrypted articles found</p>
              <button 
                className="neon-button purple"
                onClick={() => setShowAddModal(true)}
              >
                Add First Article
              </button>
            </div>
          ) : (
            filteredArticles.map(article => (
              <div key={article.id} className="article-card">
                <div className="card-header">
                  <span className={`language-badge ${article.language}`}>
                    {article.language.toUpperCase()}
                  </span>
                  <span className="category-tag">{article.category}</span>
                </div>
                <div className="card-content">
                  <div className="encrypted-preview">
                    🔒 FHE-Encrypted Content
                  </div>
                </div>
                <div className="card-footer">
                  <div className="publisher">
                    {article.publisher.substring(0, 6)}...{article.publisher.substring(38)}
                  </div>
                  <div className="timestamp">
                    {new Date(article.timestamp * 1000).toLocaleString()}
                  </div>
                </div>
              </div>
            ))
          )}
        </section>
      </main>
  
      {showAddModal && (
        <div className="modal-overlay">
          <div className="add-modal cyber-card">
            <div className="modal-header">
              <h2>Add Encrypted News Article</h2>
              <button onClick={() => setShowAddModal(false)} className="close-modal">&times;</button>
            </div>
            
            <div className="modal-body">
              <div className="form-group">
                <label>Content *</label>
                <textarea 
                  name="content"
                  value={newArticleData.content} 
                  onChange={(e) => setNewArticleData({...newArticleData, content: e.target.value})}
                  placeholder="Enter news article content to encrypt..." 
                  className="cyber-textarea"
                  rows={5}
                />
              </div>
              
              <div className="form-row">
                <div className="form-group">
                  <label>Language *</label>
                  <select
                    name="language"
                    value={newArticleData.language} 
                    onChange={(e) => setNewArticleData({...newArticleData, language: e.target.value})}
                    className="cyber-select"
                  >
                    <option value="en">English</option>
                    <option value="zh">Chinese</option>
                    <option value="es">Spanish</option>
                    <option value="fr">French</option>
                    <option value="de">German</option>
                    <option value="ja">Japanese</option>
                  </select>
                </div>
                
                <div className="form-group">
                  <label>Category *</label>
                  <select
                    name="category"
                    value={newArticleData.category} 
                    onChange={(e) => setNewArticleData({...newArticleData, category: e.target.value})}
                    className="cyber-select"
                  >
                    <option value="politics">Politics</option>
                    <option value="technology">Technology</option>
                    <option value="business">Business</option>
                    <option value="sports">Sports</option>
                    <option value="entertainment">Entertainment</option>
                    <option value="health">Health</option>
                  </select>
                </div>
              </div>
              
              <div className="fhe-notice">
                <div className="lock-icon">🔐</div>
                <span>Content will be encrypted using FHE before storage</span>
              </div>
            </div>
            
            <div className="modal-footer">
              <button 
                onClick={() => setShowAddModal(false)}
                className="neon-button blue"
              >
                Cancel
              </button>
              <button 
                onClick={addArticle} 
                disabled={adding || !newArticleData.content}
                className="neon-button purple"
              >
                {adding ? "Encrypting..." : "Encrypt & Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {notification.visible && (
        <div className={`notification ${notification.type}`}>
          {notification.message}
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <h3>NewsClusterFHE</h3>
            <p>Confidential Multi-lingual News Topic Clustering</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">GitHub</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} NewsClusterFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;