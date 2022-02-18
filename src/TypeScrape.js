const isUrl = require('./utils/isUrl.js');
const request = require('request');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const colors = require('colors'); // exposes String().color

// Detect any urls inside href, src, data-src, url()
const REGEX_URLS = new RegExp(/(((?<=href=["']))|(?<=src=["'])|(?<=data-src=["']))(\S+)(?=["'])|(?<=url\(['"])(\S+)(?=['"])|((?<=url\()[a-zA-Z0-9:/_.-]+)(?=\))/gim);

// Allowed font file extensions
const FONT_FILE_EXTENSIONS = [
  '.ttf',
  '.otf',
  '.woff',
  '.woff2',
  '.eot',
  '.eot?#iefix',
];

class TypeScrape {
  constructor (args) {
    this.arguments = args;
    this.url = null;
    this.base_url = null;
    this.output = null;

    // Check if an URL is given in the second argument
    if (this.arguments[2]) {
      if (!isUrl(this.arguments[2])) {
        console.log(String('Error').red.inverse + ' ' + String('Given argument is not of type URL.'));
      } else {
        // Filter out the base URL
        if (this.arguments[2].toString().startsWith('http://') || this.arguments[2].toString().startsWith('https://')) {
          this.url = new URL(this.arguments[2]); // Set the URL
          this.base_url = this.url.protocol + '//' + this.url.hostname; // Set the base URL;
        } else {
          this.url = new URL('http://' + this.arguments[2]); // Set the URL
          this.base_url = 'http://' + this.url.hostname;
        }
        console.log('');
        console.log('URL: ' + this.url);
        console.log('');
        this.getFonts();
      }
    } else {
      console.log(String('Error').red.inverse + ' ' + String('No URL given to scrape.'));
    }

    // Check if an output path is given
    if (this.arguments[3]) {
      if (!fs.existsSync(path.resolve(this.arguments[3]))) {
        console.log(String('Error').red.inverse + ' ' + String('Given output path doesnt exist.'));
      }
      this.output = path.resolve(this.arguments[3]);
      console.log('Output: ' + this.arguments[3]);
    }

  }

  getContents (path) {
    return new Promise((resolve, reject) => {
      request({
        uri: path
      }, function (error, response) {
        if (error) {
          reject(error);
        }
        resolve(response.body);
      });
    });
  }

  getUrlsFromString (html) {
    var urls = html.match(REGEX_URLS);
    var filteredUrls = [];
    if (!urls) {
      console.log('No urls found in the HTML to analyze.');
      return [];
    } else {
      urls.forEach(url => {
        if (url.startsWith('/') && !url.startsWith('//')) {
          filteredUrls.push(this.base_url + url);
        } else if (!url.startsWith('/') && !url.startsWith('http') && !url.startsWith('https')) {
          filteredUrls.push(this.base_url + '/' + url);
        } else {
          filteredUrls.push(url);
        }
      });
    }
    console.log('Analyzed ' + String(filteredUrls.length).yellow + ' URLs.');
    return filteredUrls;
  }

  getUrlsFromCss (css) {
    var urls = css.match(REGEX_URLS);
    var filteredUrls = [];
    if (!urls) {
      return [];
    } else {
      urls.forEach(url => {
        if (url.startsWith('/') && !url.startsWith('//')) {
          filteredUrls.push(this.base_url + url);
        } else if (!url.startsWith('/') && !url.startsWith('http') && !url.startsWith('https')) {
          filteredUrls.push(this.base_url + '/' + url);
        } else {
          filteredUrls.push(url);
        }
      });
    }
    return filteredUrls;
  }

  filterCssUrls (urls) {
    let css = [];
    urls.forEach((url) => {
      if (url.includes('css')) {
        css.push(url);
      }
    });
    console.log('Found ' + String(css.length).yellow + ' CSS files');
    return css;
  }

  areUrlsFonts (urls) {
    return new Promise((resolve, reject) => {
      let fonts = [];
      urls.forEach((url) => {
        const extension = path.extname(url);
        if (FONT_FILE_EXTENSIONS.includes(extension)) {
          fonts.push(url);
        }
      });
      resolve(fonts);
    });
  }

  findGoogleFontUrls (urls) {
    return new Promise((resolve) => {
      let googleFontUrls = [];
      urls.forEach((url) => {
        if (url.includes('fonts.googleapis.com')) {
          googleFontUrls.push(url);
        }
      });
      resolve(googleFontUrls);
    });

  }

  findFontsInCssUrls (urls) {
    return new Promise((resolve, reject) => {
      const filePaths = this.filterCssUrls(urls);
      const fonts = [];
      const getUrlPromises = [];
      const getContentPromises = [];

      filePaths.forEach((file) => {
        getContentPromises.push(this.getContents(file));
      });
      Promise.all(getContentPromises).then(values => {
        values.forEach(value => {
          getUrlPromises.push(this.getUrlsFromCss(value));
        });
      }).then(() => {
        Promise.all(getUrlPromises).then(values => {
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
        });
      });
    });
  }

  getFonts () {
    this.getContents(this.url).then((body) => {
      const urls = this.getUrlsFromString(body);
      if (urls.length === 0) {
        return false;
      }
      Promise.all([this.areUrlsFonts(urls), this.findFontsInCssUrls(urls), this.findGoogleFontUrls(urls)]).then(results => {
        // results[0] is HTML

        if (results[0].length > 0) {
          console.log('Found ' + String(results[0].length).green + ' fonts directly in the HTML.');
          results[0].forEach((url) => {
            console.log(`- ${url}`);
          });
        } else {
          console.log('Found ' + String(results[0].length).red + ' fonts directly in the HTML.');
        }

        // results[1] is CSS
        if (results[1].length > 0) {
          console.log('Found ' + String(results[1].length).green + ' fonts in the CSS files.');
          results[1].forEach((url) => {
            console.log(`- ${url}`);
          });
        } else {
          console.log('Found ' + String(results[1].length).red + ' fonts in the CSS files.');
        }

        // results[2] is Google Font Urls
        if (results[2].length > 0) {
          console.log('Found ' + String(results[2].length).green + ' Google Font URLs.');
          results[2].forEach((url) => {
            console.log(`- ${url}`);
          });
        } else {
          console.log('Found ' + String(results[2].length).red + ' Google Font URLs.');
        }

        // Check if output is given, then download to the output!
        if (this.output) {
          console.log('');
          console.log(`Downloading fonts to: ${this.output}`);
          results.forEach((resultArray, index) => {
            if (index === 2) {
              return false;
            }
            ;

            resultArray.forEach((result) => {
              const filename = path.basename(result);
              const destination = path.resolve(this.output, filename);
              this.downloadFont(result, destination, (error) => {
                if (error) {
                  console.log(String('Error').red.inverse + ' ' + String('Error downloading ' + filename));
                } else {
                  console.log(String('✓').green + ' ' + 'Downloaded: ' + filename);
                }
              });
            });
          });
        }
      });
    }).catch((e) => {
      console.log(String('Error').red.inverse + ' ' + String(`Something went wrong getting retrieving the URL: ${e}`));
    });
  }

  downloadFont (url, destination, callback) {
    var file = fs.createWriteStream(destination);
    if (new URL(url).protocol === 'https:') {
      var request = https.get(url, function (response) {
        response.pipe(file);
        file.on('finish', function () {
          file.close(callback);  // close() is async, call cb after close completes.
        });
      }).on('error', function (err) { // Handle errors
        fs.unlink(destination); // Delete the file async. (But we don't check the result)
        if (callback) callback(err.message);
      });
    } else {
      var request = http.get(url, function (response) {
        response.pipe(file);
        file.on('finish', function () {
          file.close(callback);  // close() is async, call cb after close completes.
        });
      }).on('error', function (err) { // Handle errors
        fs.unlink(destination); // Delete the file async. (But we don't check the result)
        if (callback) callback(err.message);
      });
    }

  }
}

module.exports = TypeScrape;
