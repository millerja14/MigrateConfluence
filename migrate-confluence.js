// Converts Confluence wiki export to wikijs
// Written by Jacob M. Miller, Cleland Lab, UChicago
// Forked from https://github.com/gkpln3/ConfluenceToWikiJS

// requirements
const path = require('path');
const fs = require('fs');
//var HTMLParser = require('node-html-parser');
//var beautify = require('js-beautify').html;
var HTMLParser = require('/usr/lib/node_modules/node-html-parser');
var beautify = require('/usr/lib/node_modules/js-beautify').html;

// cli arguments
const directoryPath = process.argv[2]; //directory containing Confluence html files and assets
const outDirectoryPath = process.argv[3]; //directory for wikijs to scrape

// div id specifying container for page contents to convert
const containerid = "#content";
//const containerid = "#main-content";

// regex for invalid characters in filenames
const invalidchar = /[`~!@#$%^&*()|+\=?;:'",<>\{\}\[\]\\\/]/gi;

const copylog = "copyfiles.txt"
try {
  fs.unlinkSync(copylog);
} catch (err) {
  if (err.code != 'ENOENT') throw err;
}

const lostlog = "lostfiles.txt"
try {
  fs.unlinkSync(lostlog);
} catch (err) {
  if (err.code != 'ENOENT') throw err;
}

// make output directory if it doesn't exist
if (fs.existsSync(outDirectoryPath)) {
    console.log("Directory exists.");
  } else {
    console.log("Directory does not exist. Creating " + outDirectoryPath);
    fs.mkdirSync(outDirectoryPath, {recursive: true});
  }
console.log("Beginning conversion...")

fs.readdir(directoryPath, function (err, files) {
    //handling error
    if (err) {
        return console.log('Unable to scan directory: ' + err);
    }

    //listing all files using forEach
    files.forEach(function (file) {
        if (file.endsWith(".html") && file !== "index.html") {
            //console.log("Converting " + file);
            fs.readFile(path.join(directoryPath, file), "utf8", function(err, data) {
                parsedHtml = HTMLParser.parse(data);

                // get page title in readable and filename formats
                page_title = parsedHtml.querySelector("head").querySelector("title").rawText;
                page_title = page_title.substr(page_title.search(" : ") + 3);
                page_title_spaces = page_title.replace(/[_\s\.]/g, ' ');
                page_title = page_title.trim().replace(invalidchar, '').replace(/[_\s]/g, '-').replace(/\./g, '').replace(/\u03BC|\u00B5/g, "u");

                // generate tag that wikijs uses to read page title
                page_data = "<!--\ntitle: " + page_title_spaces + "\n-->";

                // use breadcrumbs element to build the page path for the wikijs structure
                folderpath = parsedHtml.getElementById("breadcrumbs");
                breadcrumbs = folderpath.getElementsByTagName("li");
                breadcrumbs.splice(0,2);

                page_path = "";
                for (let i = 0; i < breadcrumbs.length; i++) {
                  page_path += breadcrumbs[i].textContent.trim().replace(invalidchar,'').replace(/[_\s]/g, '-').replace(/\./g, '').replace(/\u03BC|\u00B5/g, "u") + "/";
                }

                // make sure output directory exists
                pageDirectoryPath = outDirectoryPath + page_path;
                if (!fs.existsSync(pageDirectoryPath)) {
                    fs.mkdirSync(pageDirectoryPath, {recursive: true});
                }


                // for each page, create a dictionary of ids to filenames
                // when moving a file, use dictionary to convert id to filename

                filedict = {};

                //
                //
                // fix images (downloads doesnt work "Cryo RuO2 Thermometer")
                //
                //

                // get all elements with src tag
                srcelements = parsedHtml.querySelector(containerid).querySelectorAll("[src]");

                // regex for possible attachment directories
                // based on Confluence export format as of July 2022
                validdir = /^((download[\/\\]temp\/)|(attachments[\/\\][0-9]+\/))[^\/\\]+$/;


                for (let i = 0; i < srcelements.length; i++) {
                  // get asset path
                  src = srcelements[i].getAttribute("src").trim();

                  // skip if src is referring to invalid directory
                  if (!validdir.test(src)) {
                    //console.log("Non-copy dir: " + src);
                    continue;
                  }

                  // get asset filename
                  srcsplit = src.split('/');
                  srcnamesplit = srcsplit[srcsplit.length-1].split(".");

                  // skip if id is invalid
                  if (srcnamesplit.length > 2) {
                    console.log("src filename contains periods: " + src);
                    continue;
                  }

                  // record id and extension
                  srcid = srcsplit[srcsplit.length-2] + srcsplit[srcsplit.length-2].split(".")[0];
                  if (srcid.length != 18) {
                    console.log("Problem with src src id: " + srcid);
                  }

                  if (srcnamesplit.length == 1) {
                    srcext = "";
                  } else {
                    srcext = "." + srcnamesplit[1].toLowerCase();
                  }
                  src_lowerext =  src.split(".")[0]+srcext;

                  // set default filename
                  srcfilename = srcid;

                  // if file has already been moved to this page, only need to change link
                  if (srcid in filedict){
                    srcelements[i].setAttribute("src", filedict[srcid]);
                    continue;
                  }

                  // try to get filename from html element
                  srcalias = srcelements[i].getAttribute("data-linked-resource-default-alias");
                  if (typeof(srcalias) != "undefined") {
                    // get ID of file in case no filename is found
                    srcfilename = srcalias.split(".")[0];
                  }

                  // remove invalid characters and replace whitespaces with hyphens
                  srcfilename = srcfilename.replace(invalidchar,'').replace(/[_\s]/g, '-')+srcext;

                  // define source and destination
                  assetsource = path.join(directoryPath, src_lowerext);
                  assetdest = path.join(outDirectoryPath, page_path+srcfilename);

                  // move file and rename corresponding src element
                  filedict[srcid] = "/"+page_path+srcfilename;
                  try {
                    fs.copyFileSync(assetsource, assetdest, fs.constants.COPYFILE_EXCL);
                    fs.appendFileSync(copylog, assetsource + "\n");
                    srcelements[i].setAttribute("src", filedict[srcid]);
                  } catch (err) {
                    if (err.code == "EEXIST") {
                      // if the file exists already, the duplicate should still be marked as being copied
                      // and the element's src should still be updated
                      fs.appendFileSync(copylog, assetsource + "\n");
                      srcelements[i].setAttribute("src", filedict[srcid]);
                    } else {
                      console.log("Couldn't move " + assetsource + " to " + assetdest);
                      fs.appendFileSync(lostlog, page_title_spaces +": " + srcfilename + "\n");
                      console.log("Missing file on page " + page_title_spaces);
                    }
                  }
                }

                //
                //
                // fix previewed attachements like pdfs
                //
                //

                // get elements that are displayed as previews in confluence
                previewelements = parsedHtml.querySelector(containerid).querySelectorAll(".confluence-embedded-file");

                // resource ids are numeric
                validresourceid = /[0-9]+/;

                for (let i = 0; i < previewelements.length; i++) {

                  // if the preview element is incomplete, skip it
                  if (previewelements[i].getAttribute("href") == undefined | previewelements[i].getAttribute("data-linked-resource-container-id") == undefined | previewelements[i].getAttribute("data-linked-resource-id") == undefined ) {
                    console.log("Unconvertable previewelement on page: [" + page_title + "]");
                    continue;
                  }

                  // get element info
                  data_linked_resource_container_id = previewelements[i].getAttribute("data-linked-resource-container-id").trim();
                  data_linked_resource_id = previewelements[i].getAttribute("data-linked-resource-id").trim();
                  previewelement_split = previewelements[i].getAttribute("data-linked-resource-default-alias").split(".");
                  previewelement_ext = "." + previewelement_split[previewelement_split.length-1].toLowerCase();
                  previewelement_filename_full = previewelements[i].getAttribute("data-linked-resource-default-alias").trim().replace(invalidchar,'').replace(/[_\s]/g, '-').replace(/\u03BC|\u00B5/g, "u");
                  previewelement_filename = previewelement_filename_full.split(".")[0]+previewelement_ext;

                  srcid = data_linked_resource_container_id+data_linked_resource_id;
                  if (srcid.length != 18) {
                    console.log("Problem with preview element src id: " + srcid);
                  }

                  // if file has already been moved to this page, only need to change link
                  if (srcid in filedict){
                    previewelements[i].setAttribute("href", filedict[srcid]);
                    continue;
                  }

                  // build element source path
                  previewelement_path = "attachments/" + data_linked_resource_container_id + "/" + data_linked_resource_id + previewelement_ext;

                  // move file to destination directory and convert href to new location
                  if (validresourceid.test(data_linked_resource_container_id) && validresourceid.test(data_linked_resource_id)) {
                    assetsource = path.join(directoryPath, previewelement_path);
                    assetdest = path.join(outDirectoryPath, page_path+previewelement_filename);

                    filedict[srcid] = "/"+page_path+previewelement_filename;

                    try {
                      fs.copyFileSync(assetsource, assetdest, fs.constants.COPYFILE_EXCL);
                      fs.appendFileSync(copylog, assetsource + "\n");
                      previewelements[i].setAttribute("href", filedict[srcid]);

                      //console.log("Added resource at " + page_path+previewelement_filename);
                    } catch (err) {
                      if (err.code == "EEXIST") {
                        // if the file exists already, the duplicate should still be marked as being copied
                        // and the element's href should still be updated
                        fs.appendFileSync(copylog, assetsource + "\n");
                        previewelements[i].setAttribute("href", filedict[srcid]);
                      } else {
                        console.log("Couldn't move " + assetsource + " to " + assetdest);
                        fs.appendFileSync(lostlog, page_title_spaces +": " + previewelement_filename + "\n");
                        console.log("Missing file on page " + page_title_spaces);
                      }
                    }
                  } else {
                    console.log("Found invalid file path: " + previewelement_path);
                  }

                  // remove preview image - instead of clicking an image, replace with a link
                  preview_img = previewelements[i].querySelector("img");
                  if (preview_img != null) {
                    previewelements[i].querySelector("img").remove();
                  }
                  preview_label = previewelements[i].querySelector("span.title");
                  preview_label_node = '<span class="title">'+previewelement_filename+'</span><br>';
                  if (preview_label == null) {
                    previewelements[i].appendChild(HTMLParser.parse(preview_label_node));
                  } else {
                    preview_label.replaceWith(HTMLParser.parse(preview_label_node));
                  }

                }

                //
                //
                // fix slides: vf-slide-viewer-macro (e.g., electronics/bobox)
                //
                //

                // some previewed files are in a different class - specifically ppt and pdf presentations
                pptelements = parsedHtml.querySelector(containerid).querySelectorAll(".vf-slide-viewer-macro");
                for (let i = 0; i < pptelements.length; i++) {

                  data_page_id = pptelements[i].getAttribute("data-page-id").trim();
                  data_attachment_id = pptelements[i].getAttribute("data-attachment-id").trim();
                  pptelement_split = pptelements[i].getAttribute("data-attachment").split(".");
                  pptelement_ext = "." + pptelement_split[pptelement_split.length-1].toLowerCase();
                  pptelement_filename_full = pptelements[i].getAttribute("data-attachment").trim().replace(invalidchar,'').replace(/[_\s]/g, '-').replace(/\u03BC|\u00B5/g, "u");
                  pptelement_filename = pptelement_filename_full.split(".")[0]+previewelement_ext;

                  pptelement_path = "attachments/" + data_page_id + "/" + data_attachment_id + pptelement_ext;

                  srcid = data_page_id+data_attachment_id;
                  if (srcid.length != 18) {
                    console.log("Problem with pptelement src id: " + srcid);
                  }
                  // if file has already been moved to this page, only need to change link
                  if (srcid in filedict){
                    ppt_node = '<a href="' + filedict[srcid] + '"><span class="title">'+pptelement_filename+'</span><br></a>';
                    pptelements[i].replaceWith(HTMLParser.parse(ppt_node));
                    continue;
                  }

                  // move attachment to destination directory and replace preview element with a simple link element
                  if (validresourceid.test(data_page_id) && validresourceid.test(data_attachment_id)) {
                    assetsource = path.join(directoryPath, pptelement_path);
                    assetdest = path.join(outDirectoryPath, page_path+pptelement_filename);

                    filedict[srcid] = "/"+page_path+pptelement_filename;

                    try {
                      fs.copyFileSync(assetsource, assetdest, fs.constants.COPYFILE_EXCL);
                      fs.appendFileSync(copylog, assetsource + "\n");
                      ppt_node = '<a href="' + filedict[srcid] + '"><span class="title">'+pptelement_filename+'</span><br></a>';
                      pptelements[i].replaceWith(HTMLParser.parse(ppt_node));
                      //console.log("Added resource at " + page_path+previewelement_filename);
                    } catch (err) {
                      if (err.code == "EEXIST") {
                        // if the file exists already, the duplicate should still be marked as being copied
                        // and the element's html should still be updated
                        fs.appendFileSync(copylog, assetsource + "\n");
                        ppt_node = '<a href="' + filedict[srcid] + '"><span class="title">'+pptelement_filename+'</span><br></a>';
                        pptelements[i].replaceWith(HTMLParser.parse(ppt_node));
                      } else {
                        console.log("Couldn't move " + assetsource + " to " + assetdest);
                        fs.appendFileSync(lostlog, page_title_spaces +": " + pptelement_filename + "\n");
                        console.log("Missing file on page " + page_title_spaces);
                      }
                    }
                  } else {
                    console.log("Found invalid file path: " + previewelement_path);
                  }
                }


                //
                //
                // fix href file and intra-wiki page links
                //
                //

                // get all elements with href tag
                hrefelements = parsedHtml.querySelector(containerid).querySelectorAll("[href]");

                // regex to distinguish html references from others
                validhtmlpage = /^[^\/\\]+.html$/

                for (let i = 0; i < hrefelements.length; i++) {
                  href = hrefelements[i].getAttribute("href").trim();
                  hrefsplit = href.split('/');

                  // if not linking to attachment, check if its a page link
                  if (!validdir.test(href)) {

                    // check if href is linking to another wiki page and build its destination directory
                    // the same way we did for the current page. Then replace the href with the destination directory.
                    if (validhtmlpage.test(href) && href !== "index.html") {
                      try {
                        hrefdata = fs.readFileSync(path.join(directoryPath, href), {encoding:'utf8', flag:'r'});
                        hrefHtml = HTMLParser.parse(hrefdata);

                        hrefpage_title = hrefHtml.querySelector("head").querySelector("title").rawText;
                        hrefpage_title = hrefpage_title.substr(hrefpage_title.search(" : ") + 3);
                        hrefpage_title = hrefpage_title.trim().replace(invalidchar, '').replace(/[_\s]/g, '-').replace(/\./g, '').replace(/\u03BC|\u00B5/g, "u");

                        hreffolderpath = hrefHtml.getElementById("breadcrumbs");

                        hrefbreadcrumbs = hreffolderpath.getElementsByTagName("li");
                        hrefbreadcrumbs.splice(0,2);

                        hrefpage_path = "";
                        for (let i = 0; i < hrefbreadcrumbs.length; i++) {
                          hrefpage_path += hrefbreadcrumbs[i].textContent.trim().replace(invalidchar,'').replace(/[_\s]/g, '-').replace(/\./g, '').replace(/\u03BC|\u00B5/g, "u") + "/";
                        }

                        hrefnew = "/" + hrefpage_path + hrefpage_title + ".html";
                        hrefelements[i].setAttribute("href", hrefnew);

                        //console.log("HTML link switched: " + href + " to " + hrefnew);
                      } catch (err) {
                        console.log("Couldn't read file " + href)
                        console.log(err)
                      }
                    }

                    // dont need to copy href to another page
                    continue;
                  }

                  // if href is for a file

                  // try to get filename from element tag, otherwise use its numeric id
                  hreffileid = hrefsplit[hrefsplit.length-1];
                  hreffilename = hrefelements[i].getAttribute("data-linked-resource-default-alias");
                  if (typeof hreffilename == "undefined") {
                    hreffilename = hreffileid;
                  }

                  srcid = hrefsplit[hrefsplit.length-2]+hrefsplit[hrefsplit.length-1].split(".")[0];
                  if (srcid.length != 18) {
                    console.log("Problem with href src id: " + srcid);
                  }
                  // if file has already been moved to this page, only need to change link
                  if (srcid in filedict){
                    hrefelements[i].setAttribute("href", filedict[srcid]);
                    continue;
                  }

                  // fix invalid characters in filename
                  hreffilename = hreffilename.replace(invalidchar,'').replace(/[_\s]/g, '-');

                  // source and destination paths
                  assetsource = path.join(directoryPath, href);
                  assetdest = path.join(outDirectoryPath, page_path+hreffilename);

                  // move file and change href link
                  filedict[srcid] = "/"+page_path+hreffilename;
                  try {
                    fs.copyFileSync(assetsource, assetdest, fs.constants.COPYFILE_EXCL);
                    fs.appendFileSync(copylog, assetsource + "\n");
                    hrefelements[i].setAttribute("href", filedict[srcid]);
                  } catch (err) {
                    if (err.code == "EEXIST") {
                      // if the file exists already, the duplicate should still be marked as being copied
                      // and the element's href should still be updated
                      fs.appendFileSync(copylog, assetsource + "\n");
                      hrefelements[i].setAttribute("href", filedict[srcid]);

                      // if the file is alread referenced on the page then EEXIST will be raised
                      // if the current element is in the greybox, it can be removed
                      // greybox should only be for files that are not linked on the page
                      if (hrefelements[i].parentNode.classList.contains("greybox")) {
                        hrefelements[i].remove();
                      }

                    } else {
                      if (hrefelements[i].parentNode.classList.contains("greybox")) {
                        fs.appendFileSync(lostlog, page_title_spaces +": " + hreffilename + "(greybox)" + "\n");
                        hrefelements[i].remove();
                        // console.log("Greybox missing file at " + page_title_spaces);
                      } else {
                        console.log("Couldn't move " + assetsource + " to " + assetdest);
                        fs.appendFileSync(lostlog, page_title_spaces +": " + hreffilename + "\n");
                        console.log("Non-greybox missing " + hreffilename + " on page " + page_title_spaces);
                      }
                    }
                  }
                }

                greyboxes = parsedHtml.querySelector(containerid).querySelectorAll(".greybox");

                if (greyboxes.length > 1) {
                  throw "There should not be more than one greybox! Found " + greyboxes.length;
                }

                greybox = greyboxes[0];

                if (greybox != null) {
                  greybox_imgs = greybox.querySelectorAll("img");
                  for (let i = 0; i < greybox_imgs.length; i++) {
                    greybox_imgs[i].remove();
                  }
                }

                // concatenate HTML contents with page data
                page_data = page_data + parsedHtml.querySelector(containerid).innerHTML;

                // write page after beautifying
                fs.writeFileSync(path.join(outDirectoryPath, page_path + page_title + ".html"), beautify(page_data, { indent_size: 2, space_in_empty_paren: true }));
                console.log("Imported Page: [" + page_title + "]");
            });
        }
    });
});
