window.tppEnhancementsLoaded = true;

window.tppCopyText = async function(text){
  await navigator.clipboard.writeText(text);
};

window.tppBuildVerifyLink = function(documentId){
  return 'https://verify.ask4prayers.com/?id=' + encodeURIComponent(documentId);
};

window.tppBuildPrintLink = function(documentId){
  return 'print.html?id=' + encodeURIComponent(documentId);
};
