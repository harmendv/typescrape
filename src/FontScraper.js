const isUrl = require('./utils/isUrl.js');
const request = require('request');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const colors = require('colors'); // exposes String().color

// Detect any links inside href, src, data-src, url()
const REGEX_FONTS = new RegExp(/(((?<=href=["']))|(?<=src=["'])|(?<=data-src=["']))(\S+)(?=["'])|(?<=url\(['"])(\S+)(?=['"])|((?<=url\()[a-zA-Z0-9:/_.-]+)(?=\))/gim);

// Allowed font file extensions
const FONT_FILE_EXTENSIONS = [
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
  '.eot?#iefix',
];

class FontScraper {
  constructor(args) {
    this.arguments = args;
    this.url = null;
    this.base_url = null;
    this.html = null;
    this.links = [];
    this.fonts = [];
    this.output = null;

    // Check if an URL is given in the second argument
    if (this.arguments[2]) {
      if (!isUrl(this.arguments[2])) {
        throw new Error('Given argument is not of type URL.');
      } else {
        this.url = new URL(this.arguments[2]);
        // Set the base URL
        if (this.url.toString().startsWith('http://') | this.url.toString().startsWith('https://')) {
          this.base_url = this.url.protocol + '//' + this.url.hostname;
        } else {
          this.base_url = '//' + this.url.hostname;
        }
        console.log('URL: ' + this.url);
        this.getFonts();
      }
    } else {
      new Error('No URL given in first argument');
    }

    // Check if an output path is given
    if(this.arguments[3]) {
      if (!fs.existsSync(path.resolve(this.arguments[3]))) {
        throw new Error('Given output path doesnt exist.');
      }
      this.output = path.resolve(this.arguments[3]);
      console.log('Output: ' + this.arguments[3])
    }

  }

  getContents(path) {
    return new Promise((resolve, reject) => {
      request({
        uri: path
      }, function (error, response) {
        if (error) {
          reject(error);
        }
        resolve(response.body);
      })
    })
  }

  getLinksFromString(html) {
    var links = html.match(REGEX_FONTS);
    var modifiedLinks = [];
    if (!links) {
      console.log('No links found in the HTML to analyze.');
      return [];
    } else {
      links.forEach(link => {
        if (link.startsWith('/') && !link.startsWith('//')) {
          modifiedLinks.push(this.base_url + link);
        } else if (!link.startsWith('/') && !link.startsWith('http') && !link.startsWith('https')) {
          modifiedLinks.push(this.base_url + '/' + link)
        } else {
          modifiedLinks.push(link);
        }
      });
    }
    console.log('Analyzed ' + String(modifiedLinks.length).green + ' links.');
    // if(modifiedLinks.length > 0) {
    //   console.log(modifiedLinks);
    // }
    return modifiedLinks;
  }

  getLinksFromCSS(css) {
    var links = css.match(REGEX_FONTS);
    var modifiedLinks = [];
    if (!links) {
      return [];
    } else {
      links.forEach(link => {
        if (link.startsWith('/') && !link.startsWith('//')) {
          modifiedLinks.push(this.base_url + link)
        } else if (!link.startsWith('/') && !link.startsWith('http') && !link.startsWith('https')) {
          modifiedLinks.push(this.base_url + '/' + link)
        } else {
          modifiedLinks.push(link)
        }
      })
    }
    return modifiedLinks;
  }

  filterCssUrls(urls) {
    let css = [];
    urls.forEach((url) => {
      if (url.includes('css')) {
        css.push(url);
      }
    })
    console.log('Found ' + String(css.length).green + ' CSS files');
    return css;
  }

  areUrlsFonts(urls) {
    return new Promise((resolve, reject) => {
      let fonts = [];
      urls.forEach((url) => {
        const extension = path.extname(url);
        if (FONT_FILE_EXTENSIONS.includes(extension)) {
          fonts.push(url);
        }
      })
      resolve(fonts);
    })
  }

  findGoogleFontUrls(urls) {
    return new Promise((resolve) => {
      let googleFontUrls = [];
      urls.forEach((url) => {
        if (url.includes('fonts.googleapis.com')) {
          googleFontUrls.push(url);
        }
      });
      resolve(googleFontUrls);
    })

  }

  findFontsInCssUrls(urls) {
    return new Promise((resolve, reject) => {
      const filePaths = this.filterCssUrls(urls);
      const fonts = [];
      const getLinksPromises = [];
      const getContentPromises = [];

      filePaths.forEach((file) => {
        getContentPromises.push(this.getContents(file))
      })
      Promise.all(getContentPromises).then(values => {
        values.forEach(value => {
          getLinksPromises.push(this.getLinksFromCSS(value));
        })
      }).then(() => {
        Promise.all(getLinksPromises).then(values => {
          values.forEach((value) => {
            value.forEach((cssLink) => {
              const extension = path.extname(cssLink);
              if (FONT_FILE_EXTENSIONS.includes(extension)) {
                fonts.push(cssLink);
              }
            });
          });
        }).then(() => {
          resolve(fonts);
        })
      })
    })
  }

  getFonts() {
    this.getContents(this.url).then((body) => {
      const urls = this.getLinksFromString(body);
      if(urls.length === 0) {
        return false;
      }
      Promise.all([this.areUrlsFonts(urls), this.findFontsInCssUrls(urls), this.findGoogleFontUrls(urls)]).then(results => {
        // results[0] is HTML
        console.log('Found ' + String(results[0].length).green + ' fonts in directly the HTML.')
        if(results[0].length > 0) {
          results[0].forEach((url) => {
            console.log(`- ${url}`)
          })
        }
        // results[1] is CSS
        console.log('Found ' + String(results[1].length).green + ' fonts in CSS files.')
        if(results[1].length > 0) {
          results[1].forEach((url) => {
            console.log(`- ${url}`)
          })
        }
        // results[2] is Google Font Urls
        console.log('Found ' + String(results[2].length).green + ' Google Font URLs.')
        if(results[2].length > 0) {
          results[2].forEach((url) => {
            console.log(`- ${url}`)
          })
        }

        // Check if output is given, then download to the output!
        if(this.output) {
          console.log('');
          console.log('Downloading all fonts.');
          results.forEach((resultArray, index) => {
            if(index === 2) { return false; };

            resultArray.forEach((result) => {
              const filename = path.basename(result);
              const destination = path.resolve(this.output, filename);
              this.downloadFont(result, destination, (error) => {
                if(error) {
                  console.log('Error downloading ' + filename);
                } else {
                  console.log('Downloaded to ' + destination);
                }
              })
            });
          });
        }
      })
    }).catch((e) => {
      throw new Error(`Something went wrong getting retrieving the URL: ${e}`);
    })
  }

  downloadFont(url, destination, callback) {
      var file = fs.createWriteStream(destination);
      if(new URL(url).protocol === 'https:') {
        var request = https.get(url, function(response) {
          response.pipe(file);
          file.on('finish', function() {
            file.close(callback);  // close() is async, call cb after close completes.
          });
        }).on('error', function(err) { // Handle errors
          fs.unlink(destination); // Delete the file async. (But we don't check the result)
          if (callback) callback(err.message);
        });
      } else {
        var request = http.get(url, function(response) {
          response.pipe(file);
          file.on('finish', function() {
            file.close(callback);  // close() is async, call cb after close completes.
          });
        }).on('error', function(err) { // Handle errors
          fs.unlink(destination); // Delete the file async. (But we don't check the result)
          if (callback) callback(err.message);
        });
      }

  }
}

module.exports = FontScraper;
