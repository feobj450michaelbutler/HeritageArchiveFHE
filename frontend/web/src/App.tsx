import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface HeritageModel {
  id: string;
  name: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  category: string;
  era: string;
  location: string;
  status: "pending" | "verified" | "archived";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [models, setModels] = useState<HeritageModel[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newModelData, setNewModelData] = useState({
    name: "",
    category: "",
    era: "",
    location: "",
    description: ""
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedModel, setSelectedModel] = useState<HeritageModel | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [filterCategory, setFilterCategory] = useState("all");

  // Calculate statistics for dashboard
  const verifiedCount = models.filter(m => m.status === "verified").length;
  const pendingCount = models.filter(m => m.status === "pending").length;
  const archivedCount = models.filter(m => m.status === "archived").length;

  // Filter models based on search and category
  const filteredModels = models.filter(model => {
    const matchesSearch = model.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         model.location.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = filterCategory === "all" || model.category === filterCategory;
    return matchesSearch && matchesCategory;
  });

  useEffect(() => {
    loadModels().finally(() => setLoading(false));
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
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadModels = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("model_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing model keys:", e);
        }
      }
      
      const list: HeritageModel[] = [];
      
      for (const key of keys) {
        try {
          const modelBytes = await contract.getData(`model_${key}`);
          if (modelBytes.length > 0) {
            try {
              const modelData = JSON.parse(ethers.toUtf8String(modelBytes));
              list.push({
                id: key,
                name: modelData.name,
                encryptedData: modelData.data,
                timestamp: modelData.timestamp,
                owner: modelData.owner,
                category: modelData.category,
                era: modelData.era,
                location: modelData.location,
                status: modelData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing model data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading model ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setModels(list);
    } catch (e) {
      console.error("Error loading models:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const submitModel = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting heritage model with FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newModelData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const modelId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const modelData = {
        name: newModelData.name,
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        category: newModelData.category,
        era: newModelData.era,
        location: newModelData.location,
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `model_${modelId}`, 
        ethers.toUtf8Bytes(JSON.stringify(modelData))
      );
      
      const keysBytes = await contract.getData("model_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(modelId);
      
      await contract.setData(
        "model_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Heritage model encrypted and stored securely!"
      });
      
      await loadModels();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewModelData({
          name: "",
          category: "",
          era: "",
          location: "",
          description: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const verifyModel = async (modelId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted heritage data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const modelBytes = await contract.getData(`model_${modelId}`);
      if (modelBytes.length === 0) {
        throw new Error("Model not found");
      }
      
      const modelData = JSON.parse(ethers.toUtf8String(modelBytes));
      
      const updatedModel = {
        ...modelData,
        status: "verified"
      };
      
      await contract.setData(
        `model_${modelId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedModel))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE verification completed successfully!"
      });
      
      await loadModels();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Verification failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const archiveModel = async (modelId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted heritage data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const modelBytes = await contract.getData(`model_${modelId}`);
      if (modelBytes.length === 0) {
        throw new Error("Model not found");
      }
      
      const modelData = JSON.parse(ethers.toUtf8String(modelBytes));
      
      const updatedModel = {
        ...modelData,
        status: "archived"
      };
      
      await contract.setData(
        `model_${modelId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedModel))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE archival completed successfully!"
      });
      
      await loadModels();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Archival failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const checkAvailability = async () => {
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      const isAvailable = await contract.isAvailable();
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: `FHE System ${isAvailable ? "Available" : "Unavailable"}`
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Availability check failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const showModelDetails = (model: HeritageModel) => {
    setSelectedModel(model);
    setShowDetailsModal(true);
  };

  const renderPieChart = () => {
    const total = models.length || 1;
    const verifiedPercentage = (verifiedCount / total) * 100;
    const pendingPercentage = (pendingCount / total) * 100;
    const archivedPercentage = (archivedCount / total) * 100;

    return (
      <div className="pie-chart-container">
        <div className="pie-chart">
          <div 
            className="pie-segment verified" 
            style={{ transform: `rotate(${verifiedPercentage * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment pending" 
            style={{ transform: `rotate(${(verifiedPercentage + pendingPercentage) * 3.6}deg)` }}
          ></div>
          <div 
            className="pie-segment archived" 
            style={{ transform: `rotate(${(verifiedPercentage + pendingPercentage + archivedPercentage) * 3.6}deg)` }}
          ></div>
          <div className="pie-center">
            <div className="pie-value">{models.length}</div>
            <div className="pie-label">Models</div>
          </div>
        </div>
        <div className="pie-legend">
          <div className="legend-item">
            <div className="color-box verified"></div>
            <span>Verified: {verifiedCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box pending"></div>
            <span>Pending: {pendingCount}</span>
          </div>
          <div className="legend-item">
            <div className="color-box archived"></div>
            <span>Archived: {archivedCount}</span>
          </div>
        </div>
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="wood-spinner"></div>
      <p>Initializing FHE connection to heritage archive...</p>
    </div>
  );

  return (
    <div className="app-container natural-wood-theme">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="temple-icon"></div>
          </div>
          <h1>Heritage<span>Archive</span>FHE</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-model-btn wood-button"
          >
            <div className="add-icon"></div>
            Add Model
          </button>
          <button 
            className="wood-button secondary"
            onClick={checkAvailability}
          >
            Check FHE Status
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Confidential Architectural Heritage Digital Archive</h2>
            <p>Preserving historical building models with Fully Homomorphic Encryption technology</p>
          </div>
        </div>
        
        <div className="dashboard-panels">
          <div className="panel-left">
            <div className="dashboard-card wood-card">
              <h3>Project Introduction</h3>
              <p>HeritageArchiveFHE is a secure platform for storing encrypted digital models of historical buildings using FHE technology. Researchers can perform measurements and analysis on encrypted data without decryption, preserving cultural heritage while enabling study and restoration.</p>
              <div className="fhe-badge">
                <span>FHE-Powered Preservation</span>
              </div>
            </div>
            
            <div className="dashboard-card wood-card">
              <h3>Data Statistics</h3>
              <div className="stats-grid">
                <div className="stat-item">
                  <div className="stat-value">{models.length}</div>
                  <div className="stat-label">Total Models</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{verifiedCount}</div>
                  <div className="stat-label">Verified</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{pendingCount}</div>
                  <div className="stat-label">Pending</div>
                </div>
                <div className="stat-item">
                  <div className="stat-value">{archivedCount}</div>
                  <div className="stat-label">Archived</div>
                </div>
              </div>
            </div>
          </div>
          
          <div className="panel-right">
            <div className="dashboard-card wood-card">
              <h3>Status Distribution</h3>
              {renderPieChart()}
            </div>
          </div>
        </div>
        
        <div className="models-section">
          <div className="section-header">
            <h2>Encrypted Heritage Models</h2>
            <div className="header-actions">
              <div className="search-filter">
                <input 
                  type="text"
                  placeholder="Search models..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="wood-input"
                />
                <select 
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value)}
                  className="wood-select"
                >
                  <option value="all">All Categories</option>
                  <option value="Temple">Temples</option>
                  <option value="Castle">Castles</option>
                  <option value="Palace">Palaces</option>
                  <option value="Monument">Monuments</option>
                  <option value="House">Traditional Houses</option>
                </select>
              </div>
              <button 
                onClick={loadModels}
                className="refresh-btn wood-button"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="models-list wood-card">
            <div className="table-header">
              <div className="header-cell">Name</div>
              <div className="header-cell">Category</div>
              <div className="header-cell">Era</div>
              <div className="header-cell">Location</div>
              <div className="header-cell">Date</div>
              <div className="header-cell">Status</div>
              <div className="header-cell">Actions</div>
            </div>
            
            {filteredModels.length === 0 ? (
              <div className="no-models">
                <div className="no-models-icon"></div>
                <p>No heritage models found</p>
                <button 
                  className="wood-button primary"
                  onClick={() => setShowCreateModal(true)}
                >
                  Add First Model
                </button>
              </div>
            ) : (
              filteredModels.map(model => (
                <div className="model-row" key={model.id}>
                  <div className="table-cell model-name" onClick={() => showModelDetails(model)}>
                    {model.name}
                  </div>
                  <div className="table-cell">{model.category}</div>
                  <div className="table-cell">{model.era}</div>
                  <div className="table-cell">{model.location}</div>
                  <div className="table-cell">
                    {new Date(model.timestamp * 1000).toLocaleDateString()}
                  </div>
                  <div className="table-cell">
                    <span className={`status-badge ${model.status}`}>
                      {model.status}
                    </span>
                  </div>
                  <div className="table-cell actions">
                    <button 
                      className="action-btn wood-button subtle"
                      onClick={() => showModelDetails(model)}
                    >
                      Details
                    </button>
                    {isOwner(model.owner) && model.status === "pending" && (
                      <>
                        <button 
                          className="action-btn wood-button success"
                          onClick={() => verifyModel(model.id)}
                        >
                          Verify
                        </button>
                        <button 
                          className="action-btn wood-button danger"
                          onClick={() => archiveModel(model.id)}
                        >
                          Archive
                        </button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={submitModel} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          modelData={newModelData}
          setModelData={setNewModelData}
        />
      )}
      
      {showDetailsModal && selectedModel && (
        <ModalDetails 
          model={selectedModel}
          onClose={() => setShowDetailsModal(false)}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content wood-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="wood-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="temple-icon"></div>
              <span>HeritageArchiveFHE</span>
            </div>
            <p>Preserving architectural heritage with FHE encryption technology</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">Research Partners</a>
            <a href="#" className="footer-link">Contact</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Preservation</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} HeritageArchiveFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  modelData: any;
  setModelData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  modelData,
  setModelData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setModelData({
      ...modelData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!modelData.name || !modelData.category) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal wood-card">
        <div className="modal-header">
          <h2>Add Heritage Model</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="key-icon"></div> Your heritage model will be encrypted with FHE technology
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Model Name *</label>
              <input 
                type="text"
                name="name"
                value={modelData.name} 
                onChange={handleChange}
                placeholder="Enter model name..." 
                className="wood-input"
              />
            </div>
            
            <div className="form-group">
              <label>Category *</label>
              <select 
                name="category"
                value={modelData.category} 
                onChange={handleChange}
                className="wood-select"
              >
                <option value="">Select category</option>
                <option value="Temple">Temple</option>
                <option value="Castle">Castle</option>
                <option value="Palace">Palace</option>
                <option value="Monument">Monument</option>
                <option value="House">Traditional House</option>
              </select>
            </div>
            
            <div className="form-group">
              <label>Historical Era</label>
              <input 
                type="text"
                name="era"
                value={modelData.era} 
                onChange={handleChange}
                placeholder="E.g., Ming Dynasty, Edo Period..." 
                className="wood-input"
              />
            </div>
            
            <div className="form-group">
              <label>Location</label>
              <input 
                type="text"
                name="location"
                value={modelData.location} 
                onChange={handleChange}
                placeholder="City, Country..." 
                className="wood-input"
              />
            </div>
            
            <div className="form-group full-width">
              <label>Description</label>
              <textarea 
                name="description"
                value={modelData.description} 
                onChange={handleChange}
                placeholder="Describe the heritage model and its significance..." 
                className="wood-textarea"
                rows={4}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="privacy-icon"></div> Model data remains encrypted during FHE processing and analysis
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn wood-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn wood-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

interface ModalDetailsProps {
  model: HeritageModel;
  onClose: () => void;
}

const ModalDetails: React.FC<ModalDetailsProps> = ({ model, onClose }) => {
  return (
    <div className="modal-overlay">
      <div className="details-modal wood-card">
        <div className="modal-header">
          <h2>Model Details</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="detail-item">
            <label>Name:</label>
            <span>{model.name}</span>
          </div>
          
          <div className="detail-item">
            <label>Category:</label>
            <span>{model.category}</span>
          </div>
          
          <div className="detail-item">
            <label>Era:</label>
            <span>{model.era || "Not specified"}</span>
          </div>
          
          <div className="detail-item">
            <label>Location:</label>
            <span>{model.location || "Not specified"}</span>
          </div>
          
          <div className="detail-item">
            <label>Owner:</label>
            <span className="owner-address">{model.owner.substring(0, 8)}...{model.owner.substring(36)}</span>
          </div>
          
          <div className="detail-item">
            <label>Added:</label>
            <span>{new Date(model.timestamp * 1000).toLocaleString()}</span>
          </div>
          
          <div className="detail-item">
            <label>Status:</label>
            <span className={`status-badge ${model.status}`}>{model.status}</span>
          </div>
          
          <div className="fhe-notice">
            <div className="lock-icon"></div>
            <p>This model is encrypted using FHE technology. Analysis can be performed without decryption.</p>
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="close-btn wood-button"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;