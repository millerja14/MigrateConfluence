// requirements
const path = require('path');
const fs = require('fs');

// cli arguments
const logPath = process.argv[2]; //the .txt file containing a list of file paths that have been copied by the conversion script
const directoryPath = process.argv[3]; //directory containing Confluence html files and assets
const outDirectoryPath = process.argv[4]; //directory for wikijs to scrape

const outDirectorySubPath = path.join(outDirectoryPath, "UnlinkedAssets");
if (fs.existsSync(outDirectorySubPath)) {
  console.log("Directory exists.");
} else {
  console.log("Directory does not exist. Creating " + outDirectorySubPath);
  fs.mkdirSync(outDirectorySubPath, {recursive: true});
}

const noncopylog = "noncopyfiles.txt";
try {
  fs.unlinkSync(noncopylog);
} catch (err) {
  if (err.code != 'ENOENT') throw err;
}

const copylog_contents = fs.readFileSync(logPath, 'utf-8');

const getAllFiles = function(dirPath, log, arrayOfFiles) {
  files = fs.readdirSync(dirPath);

  arrayOfFiles = arrayOfFiles || [];

  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, log, arrayOfFiles);
    } else {
      checkDuplicate(dirPath + "/" + file);
    }
  })

  return true;
}

const checkDuplicate = function(asset_source) {
  if (!copylog_contents.includes(asset_source)) {
    console.log("Found non-copied file: " + asset_source);
    fs.appendFileSync(noncopylog, asset_source + "\n");

    filename_slice = asset_source.split("/").slice(-2);

    new_dir = path.join(outDirectorySubPath, filename_slice[0])
    if (!fs.existsSync(new_dir)) {
      fs.mkdirSync(new_dir, {recursive: true});
    }

    asset_dest = path.join(new_dir, filename_slice[1]);

    try {
      fs.copyFileSync(asset_source, asset_dest, fs.constants.COPYFILE_EXCL);
    } catch (err) {
      if (err.code !== "EEXIST") {
        console.log("Couldn't move " + asset_source + " to " + asset_dest);
        console.log(err.code);
      }
    }
  }
}

getAllFiles(path.join(directoryPath,"attachments"), noncopylog);
