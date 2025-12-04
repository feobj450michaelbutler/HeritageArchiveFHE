// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract HeritageArchiveFHE is SepoliaConfig {
    struct EncryptedHeritageModel {
        uint256 id;
        euint32 encryptedModelData;
        euint32 encryptedBuildingType;
        euint32 encryptedLocation;
        uint256 timestamp;
    }
    
    struct DecryptedHeritageModel {
        string modelData;
        string buildingType;
        string location;
        bool isAnalyzed;
    }

    uint256 public modelCount;
    mapping(uint256 => EncryptedHeritageModel) public encryptedModels;
    mapping(uint256 => DecryptedHeritageModel) public decryptedModels;
    
    mapping(string => euint32) private encryptedBuildingTypeStats;
    string[] private buildingTypeList;
    
    mapping(uint256 => uint256) private requestToModelId;
    
    event ModelSubmitted(uint256 indexed id, uint256 timestamp);
    event AnalysisRequested(uint256 indexed id);
    event ModelAnalyzed(uint256 indexed id);
    
    modifier onlyResearcher(uint256 modelId) {
        _;
    }
    
    function submitEncryptedModel(
        euint32 encryptedModelData,
        euint32 encryptedBuildingType,
        euint32 encryptedLocation
    ) public {
        modelCount += 1;
        uint256 newId = modelCount;
        
        encryptedModels[newId] = EncryptedHeritageModel({
            id: newId,
            encryptedModelData: encryptedModelData,
            encryptedBuildingType: encryptedBuildingType,
            encryptedLocation: encryptedLocation,
            timestamp: block.timestamp
        });
        
        decryptedModels[newId] = DecryptedHeritageModel({
            modelData: "",
            buildingType: "",
            location: "",
            isAnalyzed: false
        });
        
        emit ModelSubmitted(newId, block.timestamp);
    }
    
    function requestModelAnalysis(uint256 modelId) public onlyResearcher(modelId) {
        EncryptedHeritageModel storage model = encryptedModels[modelId];
        require(!decryptedModels[modelId].isAnalyzed, "Already analyzed");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(model.encryptedModelData);
        ciphertexts[1] = FHE.toBytes32(model.encryptedBuildingType);
        ciphertexts[2] = FHE.toBytes32(model.encryptedLocation);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.analyzeModel.selector);
        requestToModelId[reqId] = modelId;
        
        emit AnalysisRequested(modelId);
    }
    
    function analyzeModel(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 modelId = requestToModelId[requestId];
        require(modelId != 0, "Invalid request");
        
        EncryptedHeritageModel storage eModel = encryptedModels[modelId];
        DecryptedHeritageModel storage dModel = decryptedModels[modelId];
        require(!dModel.isAnalyzed, "Already analyzed");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        (string memory modelData, string memory buildingType, string memory location) = 
            abi.decode(cleartexts, (string, string, string));
        
        dModel.modelData = modelData;
        dModel.buildingType = buildingType;
        dModel.location = location;
        dModel.isAnalyzed = true;
        
        if (FHE.isInitialized(encryptedBuildingTypeStats[dModel.buildingType]) == false) {
            encryptedBuildingTypeStats[dModel.buildingType] = FHE.asEuint32(0);
            buildingTypeList.push(dModel.buildingType);
        }
        encryptedBuildingTypeStats[dModel.buildingType] = FHE.add(
            encryptedBuildingTypeStats[dModel.buildingType], 
            FHE.asEuint32(1)
        );
        
        emit ModelAnalyzed(modelId);
    }
    
    function getDecryptedModel(uint256 modelId) public view returns (
        string memory modelData,
        string memory buildingType,
        string memory location,
        bool isAnalyzed
    ) {
        DecryptedHeritageModel storage m = decryptedModels[modelId];
        return (m.modelData, m.buildingType, m.location, m.isAnalyzed);
    }
    
    function getEncryptedBuildingTypeStats(string memory buildingType) public view returns (euint32) {
        return encryptedBuildingTypeStats[buildingType];
    }
    
    function requestBuildingTypeStatsDecryption(string memory buildingType) public {
        euint32 stats = encryptedBuildingTypeStats[buildingType];
        require(FHE.isInitialized(stats), "Building type not found");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(stats);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptBuildingTypeStats.selector);
        requestToModelId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(buildingType)));
    }
    
    function decryptBuildingTypeStats(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 buildingTypeHash = requestToModelId[requestId];
        string memory buildingType = getBuildingTypeFromHash(buildingTypeHash);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        uint32 stats = abi.decode(cleartexts, (uint32));
    }
    
    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }
    
    function getBuildingTypeFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < buildingTypeList.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(buildingTypeList[i]))) == hash) {
                return buildingTypeList[i];
            }
        }
        revert("Building type not found");
    }
    
    function calculateStructuralMeasurements(
        uint256 modelId,
        string memory measurementType
    ) public view returns (uint256 measurement) {
        DecryptedHeritageModel storage model = decryptedModels[modelId];
        require(model.isAnalyzed, "Model not analyzed");
        
        // Simplified measurement calculation
        // In real implementation, this would analyze the 3D model data
        if (keccak256(abi.encodePacked(measurementType)) == keccak256(abi.encodePacked("height"))) {
            return 1000; // cm
        } else if (keccak256(abi.encodePacked(measurementType)) == keccak256(abi.encodePacked("area"))) {
            return 5000; // m²
        } else {
            return 0;
        }
    }
    
    function detectStructuralIssues(
        uint256 modelId,
        string memory analysisType
    ) public view returns (string memory issues) {
        DecryptedHeritageModel storage model = decryptedModels[modelId];
        require(model.isAnalyzed, "Model not analyzed");
        
        // Simplified structural analysis
        // In real implementation, this would perform detailed structural analysis
        return "No major issues detected";
    }
}