// NewsClusterFHE.sol
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract NewsClusterFHE is SepoliaConfig {
    struct EncryptedArticle {
        uint256 id;
        euint32 encryptedContent;
        euint32 encryptedLanguageCode;
        euint32 encryptedTopicVector;
        uint256 timestamp;
    }
    
    struct ClusterResult {
        euint32 encryptedClusterId;
        euint32 encryptedSimilarityScore;
    }

    struct DecryptedArticle {
        string content;
        string languageCode;
        string topicVector;
        bool isRevealed;
    }

    uint256 public articleCount;
    mapping(uint256 => EncryptedArticle) public encryptedArticles;
    mapping(uint256 => DecryptedArticle) public decryptedArticles;
    mapping(uint256 => ClusterResult) public clusterResults;
    
    mapping(uint256 => uint256) private requestToArticleId;
    
    event ArticleSubmitted(uint256 indexed id, uint256 timestamp);
    event ClusteringRequested(uint256 indexed articleId);
    event ClusteringCompleted(uint256 indexed articleId);
    event DecryptionRequested(uint256 indexed articleId);
    event ArticleDecrypted(uint256 indexed articleId);
    
    modifier onlyPublisher(uint256 articleId) {
        _;
    }
    
    function submitEncryptedArticle(
        euint32 encryptedContent,
        euint32 encryptedLanguageCode,
        euint32 encryptedTopicVector
    ) public {
        articleCount += 1;
        uint256 newId = articleCount;
        
        encryptedArticles[newId] = EncryptedArticle({
            id: newId,
            encryptedContent: encryptedContent,
            encryptedLanguageCode: encryptedLanguageCode,
            encryptedTopicVector: encryptedTopicVector,
            timestamp: block.timestamp
        });
        
        decryptedArticles[newId] = DecryptedArticle({
            content: "",
            languageCode: "",
            topicVector: "",
            isRevealed: false
        });
        
        emit ArticleSubmitted(newId, block.timestamp);
    }
    
    function requestArticleDecryption(uint256 articleId) public onlyPublisher(articleId) {
        EncryptedArticle storage article = encryptedArticles[articleId];
        require(!decryptedArticles[articleId].isRevealed, "Already decrypted");
        
        bytes32[] memory ciphertexts = new bytes32[](3);
        ciphertexts[0] = FHE.toBytes32(article.encryptedContent);
        ciphertexts[1] = FHE.toBytes32(article.encryptedLanguageCode);
        ciphertexts[2] = FHE.toBytes32(article.encryptedTopicVector);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptArticle.selector);
        requestToArticleId[reqId] = articleId;
        
        emit DecryptionRequested(articleId);
    }
    
    function decryptArticle(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 articleId = requestToArticleId[requestId];
        require(articleId != 0, "Invalid request");
        
        EncryptedArticle storage eArticle = encryptedArticles[articleId];
        DecryptedArticle storage dArticle = decryptedArticles[articleId];
        require(!dArticle.isRevealed, "Already decrypted");
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        string[] memory results = abi.decode(cleartexts, (string[]));
        
        dArticle.content = results[0];
        dArticle.languageCode = results[1];
        dArticle.topicVector = results[2];
        dArticle.isRevealed = true;
        
        emit ArticleDecrypted(articleId);
    }
    
    function requestClustering(uint256 articleId) public {
        require(encryptedArticles[articleId].id != 0, "Article not found");
        
        emit ClusteringRequested(articleId);
    }
    
    function submitClusterResult(
        uint256 articleId,
        euint32 encryptedClusterId,
        euint32 encryptedSimilarityScore
    ) public {
        clusterResults[articleId] = ClusterResult({
            encryptedClusterId: encryptedClusterId,
            encryptedSimilarityScore: encryptedSimilarityScore
        });
        
        emit ClusteringCompleted(articleId);
    }
    
    function requestResultDecryption(uint256 articleId, uint8 resultType) public onlyPublisher(articleId) {
        ClusterResult storage result = clusterResults[articleId];
        require(FHE.isInitialized(result.encryptedClusterId), "No results available");
        
        bytes32[] memory ciphertexts = new bytes32[](1);
        
        if (resultType == 0) {
            ciphertexts[0] = FHE.toBytes32(result.encryptedClusterId);
        } else if (resultType == 1) {
            ciphertexts[0] = FHE.toBytes32(result.encryptedSimilarityScore);
        } else {
            revert("Invalid result type");
        }
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptClusterResult.selector);
        requestToArticleId[reqId] = articleId * 10 + resultType;
    }
    
    function decryptClusterResult(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 compositeId = requestToArticleId[requestId];
        uint256 articleId = compositeId / 10;
        uint8 resultType = uint8(compositeId % 10);
        
        FHE.checkSignatures(requestId, cleartexts, proof);
        
        string memory result = abi.decode(cleartexts, (string));
    }
    
    function getDecryptedArticle(uint256 articleId) public view returns (
        string memory content,
        string memory languageCode,
        string memory topicVector,
        bool isRevealed
    ) {
        DecryptedArticle storage a = decryptedArticles[articleId];
        return (a.content, a.languageCode, a.topicVector, a.isRevealed);
    }
    
    function hasClusterResults(uint256 articleId) public view returns (bool) {
        return FHE.isInitialized(clusterResults[articleId].encryptedClusterId);
    }
}