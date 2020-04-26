// custom graph component
Vue.component('graph', {

  props: ['graphData', 'day', 'resize'],

  template: '<div ref="graph" id="graph" style="height: 100%;"></div>',

  methods: {

    mountGraph() {

      Plotly.newPlot(this.$refs.graph, [], {}, {responsive: true});

      this.$refs.graph.on('plotly_hover', this.onHoverOn)
        .on('plotly_unhover', this.onHoverOff)
        .on('plotly_relayout', this.onLayoutChange);

    },

    onHoverOn(data) {

        let curveNumber = data.points[0].curveNumber;
        let name = this.graphData.traces[curveNumber].name;

        if (name) {

          this.traceIndices = this.graphData.traces.map((e,i) => e.name == name ? i : -1).filter(e => e >= 0);
          let update = {'line':{color: 'rgba(254, 52, 110, 1)'}};

          for (let i of this.traceIndices) {
            Plotly.restyle(this.$refs.graph, update, [i]);
          }
        }

    },

    onHoverOff(data) {

        let update = {'line':{color: 'rgba(0,0,0,0.15)'}};

        for (let i of this.traceIndices) {
          Plotly.restyle(this.$refs.graph, update, [i]);
        }

    },

    onLayoutChange(data) {

      this.emitGraphAttributes();

      // if the user selects autorange, go back to the default range
      if (data['xaxis.autorange'] == true || data['yaxis.autorange'] == true) {
        this.userSetRange = false;
        this.updateGraph();
      }

      // if the user selects a custom range, use this
      else if (data['xaxis.range[0]']) {
        this.xrange = [data['xaxis.range[0]'], data['xaxis.range[1]']].map(e => parseFloat(e));
        this.yrange = [data['yaxis.range[0]'], data['yaxis.range[1]']].map(e => parseFloat(e));
        this.userSetRange = true;
      }

    },

    updateGraph() {

      // we're deep copying the layout object to avoid side effects
      // because plotly mutates layout on user input
      // note: this may cause issues if we pass in date objects through the layout
      let layout = JSON.parse(JSON.stringify(this.graphData.layout));

      // if the user selects a custom range, use it
      if (this.userSetRange) {
        layout.xaxis.range = this.xrange;
        layout.yaxis.range = this.yrange;
      }

      Plotly.react(this.$refs.graph, this.graphData.traces, layout, this.graphData.config);

    },

    calculateAngle() {
      if (this.graphData.uistate.showTrendLine) {
        let element = this.$refs.graph.querySelector(".cartesianlayer").querySelector(".plot").querySelector(".scatterlayer").lastChild.querySelector(".lines").firstChild.getAttribute('d');
        let pts = element.split('M').join(',').split('L').join(',').split(',').filter(e => e != '');
        let angle = Math.atan2(pts[3] - pts[1], pts[2] - pts[0]);
        return angle;
      } else {
        return NaN;
      }
    },

    emitGraphAttributes() {
      let graphOuterDiv = this.$refs.graph.querySelector(".main-svg").attributes;
      this.$emit('update:width', graphOuterDiv.width.nodeValue)
      this.$emit('update:height', graphOuterDiv.height.nodeValue)

      let graphInnerDiv = this.$refs.graph.querySelector(".xy").firstChild.attributes;
      this.$emit('update:innerWidth', graphInnerDiv.width.nodeValue)
      this.$emit('update:innerHeight', graphInnerDiv.height.nodeValue)
      this.$emit('update:referenceLineAngle', this.calculateAngle());
    }

  },

  mounted() {
    this.mountGraph();

    if (this.graphData) {
      this.updateGraph();
    }

    this.emitGraphAttributes();
    this.$emit('update:mounted', true)

  },

  watch: {

    graphData: {

      deep: true,

      handler(data, oldData) {

        // if UI state changes, revert to auto range
        if (JSON.stringify(data.uistate) != JSON.stringify(oldData.uistate)) {
          this.userSetRange = false;
        }

        this.updateGraph();
        this.$emit('update:referenceLineAngle', this.calculateAngle());

      }

    },

    resize() {
      Plotly.Plots.resize(this.$refs.graph);
    },


  },

  data() {
    return {
      xrange: [], // stores user selected xrange
      yrange: [], // stores user selected yrange
      userSetRange: false, // determines whether to use user selected range
      traceIndices: [],
    }
  }

})

// global data
let app = new Vue({

  el: '#root',

  mounted() {
    this.pullData(this.selectedData, this.selectedRegion, this.perCapita);
  },

  created: function() {

    let url = window.location.href.split('?');

    if (url.length > 1) {

      let urlParameters = new URLSearchParams(url[1]);

      if (urlParameters.has('scale')) {

        let myScale = urlParameters.get('scale').toLowerCase();

        if (myScale == 'log') {
          this.selectedScale = 'Logarithmic Scale';
        } else if (myScale == 'linear') {
          this.selectedScale = 'Linear Scale';
        }
      }

      if (urlParameters.has('data')) {
        let myData = urlParameters.get('data').toLowerCase();
        if (myData == 'cases') {
          this.selectedData = 'Confirmed Cases';
        } else if (myData == 'deaths') {
          this.selectedData = 'Reported Deaths';
        }

      }

      if (urlParameters.has('region')) {
        let myRegion = urlParameters.get('region');
        if (this.regions.includes(myRegion)) {
          this.selectedRegion = myRegion;
        }
      }

      // since this rename came later, use the old name to not break existing URLs
      let renames = {
        'China': 'China (Mainland)'
      };

      // before we added regions, the url parameter was called country instead of location
      // we still check for this so as to not break existing URLs
      if (urlParameters.has('country')) {
        this.selectedCountries = urlParameters.getAll('country').map(e => Object.keys(renames).includes(e) ? renames[e] : e);
      } else if (urlParameters.has('location')) {
        this.selectedCountries = urlParameters.getAll('location').map(e => Object.keys(renames).includes(e) ? renames[e] : e);
      }
      
      if (urlParameters.has('perCapita')) {
        let perCapita = urlParameters.get('perCapita');
        this.perCapita = (perCapita == 'true');
      }

      if (urlParameters.has('trendline')) {
        let showTrendLine = urlParameters.get('trendline');
        this.showTrendLine = (showTrendLine == 'true');
      } else if (urlParameters.has('doublingtime')) {
        let doublingTime = urlParameters.get('doublingtime');
        this.doublingTime = doublingTime;
      }


    }

    window.addEventListener('keydown', e => {

      if ((e.key == ' ') && this.dates.length > 0) {
        this.play();
      }

      else if ((e.key == '-' || e.key == '_') && this.dates.length > 0) {
        this.paused = true;
        this.day = Math.max(this.day - 1, this.minDay);
      }

      else if ((e.key  == '+' || e.key == '=') && this.dates.length > 0) {
        this.paused = true;
        this.day = Math.min(this.day + 1, this.dates.length)
      }

    });

  },


  watch: {
    selectedData() {
      if (!this.firstLoad) {
        this.pullData(this.selectedData, this.selectedRegion, this.perCapita, /*updateSelectedCountries*/ false);
      }
      this.searchField = '';
    },

    selectedRegion() {
      if (!this.firstLoad) {
        this.pullData(this.selectedData, this.selectedRegion, this.perCapita, /*updateSelectedCountries*/ true);
      }
      this.searchField = '';
    },
    
    perCapita() {
      if (!this.firstLoad) {
        this.pullData(this.selectedData, this.selectedRegion, this.perCapita, /*updateSelectedCountries*/ true);
      }
      this.searchField = '';
    },

    minDay() {
      if (this.day < this.minDay) {
        this.day = this.minDay;
      }
    },

    'graphAttributes.mounted': function() {

      if (this.graphAttributes.mounted && this.autoplay && this.minDay > 0) {
        this.day = this.minDay;
        this.play();
        this.autoplay = false; // disable autoplay on first play
      }
    },

    searchField() {
      let debouncedSearch = this.debounce(this.search, 250, false);
      debouncedSearch();
    }
  },

  methods: {

    debounce(func, wait, immediate) { // https://davidwalsh.name/javascript-debounce-function
      var timeout;
      return function() {
        var context = this, args = arguments;
        var later = function() {
          timeout = null;
          if (!immediate) func.apply(context, args);
        };
        var callNow = immediate && !timeout;
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
        if (callNow) func.apply(context, args);
      };
    },

    myMax() { // https://stackoverflow.com/a/12957522
      var par = []
      for (var i = 0; i < arguments.length; i++) {
          if (!isNaN(arguments[i])) {
              par.push(arguments[i]);
          }
      }
      return Math.max.apply(Math, par);
    },

    myMin() {
      var par = []
      for (var i = 0; i < arguments.length; i++) {
          if (!isNaN(arguments[i])) {
              par.push(arguments[i]);
          }
      }
      return Math.min.apply(Math, par);
    },

    pullData(selectedData, selectedRegion, perCapita, updateSelectedCountries = true) {

      if (selectedRegion != 'US') {
        let url;
        if (selectedData == 'Confirmed Cases') {
         url = 'https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_confirmed_global.csv';
        } else if (selectedData == 'Reported Deaths') {
         url = 'https://raw.githubusercontent.com/CSSEGISandData/COVID-19/master/csse_covid_19_data/csse_covid_19_time_series/time_series_covid19_deaths_global.csv';
        } else {
          return;
        }
        Plotly.d3.csv(url, (data) => this.processData(data, selectedRegion, perCapita, updateSelectedCountries));
      } else { // selectedRegion == 'US'
        const type = (selectedData == 'Reported Deaths') ? 'deaths' : 'cases'
        const url = 'https://raw.githubusercontent.com/nytimes/covid-19-data/master/us-states.csv';
        Plotly.d3.csv(url, (data) => this.processData(this.preprocessNYTData(data, type), selectedRegion, perCapita, updateSelectedCountries));
      }
    },

    removeRepeats(array) {
      return [...new Set(array)];
    },

    groupByCountry(data, dates, regionsToPullToCountryLevel /* pulls out Hong Kong & Macau from region to country level */) {

      let countries = data.map(e => e['Country/Region']);
      countries = this.removeRepeats(countries);

      let grouped = [];
      for (let country of countries){

        // filter data for this country (& exclude regions we're pulling to country level)
        // e.g. Mainland China numbers should not include Hong Kong & Macau, to avoid double counting
        let countryData = data.filter(e => e['Country/Region'] == country)
          .filter(e => !regionsToPullToCountryLevel.includes(e['Province/State']));

        const row = {region: country}

        for (let date of dates) {
          let sum = countryData.map(e => parseInt(e[date]) || 0).reduce((a,b) => a+b);
          row[date] = sum;
        }

        grouped.push(row);

      }

      return grouped;
    },

    filterByCountry(data, dates, selectedRegion) {
      return data.filter(e => e['Country/Region'] == selectedRegion)
          .map(e => Object.assign({}, e, {region: e['Province/State']}));
    },

    convertStateToCountry(data, dates, selectedRegion) {
      return data.filter(e => e['Province/State'] == selectedRegion)
          .map(e => Object.assign({}, e, {region: e['Province/State']}));
    },

    processData(data, selectedRegion, perCapita, updateSelectedCountries) {
      let dates = Object.keys(data[0]).slice(4);
      this.dates = dates;
      this.day = this.dates.length;

      let regionsToPullToCountryLevel = ['Hong Kong', 'Macau']

      let grouped;

      if (selectedRegion == 'World') {
        grouped = this.groupByCountry(data, dates, regionsToPullToCountryLevel);

        // pull Hong Kong and Macau to Country level
        for (let region of regionsToPullToCountryLevel) {
          let country = this.convertStateToCountry(data, dates, region);
          if (country.length === 1) {
            grouped = grouped.concat(country);
          }
        }

      } else {
        grouped = this.filterByCountry(data, dates, selectedRegion)
        .filter(e => !regionsToPullToCountryLevel.includes(e.region)); // also filter our Hong Kong and Macau as subregions of Mainland China
      }

      let exclusions = ['Cruise Ship', 'Diamond Princess', 'MS Zaandam'];

      let renames = {
        'Taiwan*': 'Taiwan',
        'Korea, South': 'South Korea',
        'China': 'China (Mainland)'
      };
      
      let regionSizes = {
        'World': { // Source https://www.worldometers.info/world-population/population-by-country/
          'Afghanistan':38928346,
        	'Albania':2877797,
        	'Algeria':43851044,
        	'American Samoa':55191,
        	'Andorra':77265,
        	'Angola':32866272,
        	'Anguilla':15003,
        	'Antigua and Barbuda':97929,
        	'Argentina':45195774,
        	'Armenia':2963243,
        	'Aruba':106766,
        	'Australia':25499884,
        	'Austria':9006398,
        	'Azerbaijan':10139177,
        	'Bahamas':393244,
        	'Bahrain':1701575,
        	'Bangladesh':164689383,
        	'Barbados':287375,
        	'Belarus':9449323,
        	'Belgium':11589623,
        	'Belize':397628,
        	'Benin':12123200,
        	'Bermuda':62278,
        	'Bhutan':771608,
        	'Bolivia':11673021,
        	'Bosnia and Herzegovina':3280819,
        	'Botswana':2351627,
        	'Brazil':212559417,
        	'British Virgin Islands':30231,
        	'Brunei':437479,
        	'Bulgaria':6948445,
        	'Burkina Faso':20903273,
        	'Burundi':11890784,
        	'Cabo Verde':555987,
        	'Cambodia':16718965,
        	'Cameroon':26545863,
        	'Canada':37742154,
        	'Caribbean Netherlands':26223,
        	'Cayman Islands':65722,
        	'Central African Republic':4829767,
        	'Chad':16425864,
        	'Channel Islands':173863,
        	'Chile':19116201,
        	'China (Mainland)':1439323776,
        	'Colombia':50882891,
        	'Comoros':869601,
        	'Congo':5518087,
        	'Cook Islands':17564,
        	'Costa Rica':5094118,
        	'Croatia':4105267,
        	'Cuba':11326616,
        	'Curaçao':164093,
        	'Cyprus':1207359,
        	'Czechia':10708981,
        	'Cote d\'Ivoire':26378274,
        	'Denmark':5792202,
        	'Djibouti':988000,
        	'Dominica':71986,
        	'Dominican Republic':10847910,
        	'DR Congo':89561403,
        	'Ecuador':17643054,
        	'Egypt':102334404,
        	'El Salvador':6486205,
        	'Equatorial Guinea':1402985,
        	'Eritrea':3546421,
        	'Estonia':1326535,
        	'Eswatini':1160164,
        	'Ethiopia':114963588,
        	'Faeroe Islands':48863,
        	'Falkland Islands':3480,
        	'Fiji':896445,
        	'Finland':5540720,
        	'France':65273511,
        	'French Guiana':298682,
        	'French Polynesia':280908,
        	'Gabon':2225734,
        	'Gambia':2416668,
        	'Georgia':3989167,
        	'Germany':83783942,
        	'Ghana':31072940,
        	'Gibraltar':33691,
        	'Greece':10423054,
        	'Greenland':56770,
        	'Grenada':112523,
        	'Guadeloupe':400124,
        	'Guam':168775,
        	'Guatemala':17915568,
        	'Guinea':13132795,
        	'Guinea-Bissau':1968001,
        	'Guyana':786552,
        	'Haiti':11402528,
        	'Holy See':801,
        	'Honduras':9904607,
        	'Hong Kong':7496981,
        	'Hungary':9660351,
        	'Iceland':341243,
        	'India':1380004385,
        	'Indonesia':273523615,
        	'Iran':83992949,
        	'Iraq':40222493,
        	'Ireland':4937786,
        	'Isle of Man':85033,
        	'Israel':8655535,
        	'Italy':60461826,
        	'Jamaica':2961167,
        	'Japan':126476461,
        	'Jordan':10203134,
        	'Kazakhstan':18776707,
        	'Kenya':53771296,
        	'Kiribati':119449,
          'Kosovo': 1810366, // Pulled from countrymeters.info/en/Kosovo
        	'Kuwait':4270571,
        	'Kyrgyzstan':6524195,
        	'Laos':7275560,
        	'Latvia':1886198,
        	'Lebanon':6825445,
        	'Lesotho':2142249,
        	'Liberia':5057681,
        	'Libya':6871292,
        	'Liechtenstein':38128,
        	'Lithuania':2722289,
        	'Luxembourg':625978,
        	'Macau':649335,
        	'Madagascar':27691018,
        	'Malawi':19129952,
        	'Malaysia':32365999,
        	'Maldives':540544,
        	'Mali':20250833,
        	'Malta':441543,
        	'Marshall Islands':59190,
        	'Martinique':375265,
        	'Mauritania':4649658,
        	'Mauritius':1271768,
        	'Mayotte':272815,
        	'Mexico':128932753,
        	'Micronesia':115023,
        	'Moldova':4033963,
        	'Monaco':39242,
        	'Mongolia':3278290,
        	'Montenegro':628066,
        	'Montserrat':4992,
        	'Morocco':36910560,
        	'Mozambique':31255435,
        	'Burma':54409800,
        	'Namibia':2540905,
        	'Nauru':10824,
        	'Nepal':29136808,
        	'Netherlands':17134872,
        	'New Caledonia':285498,
        	'New Zealand':4822233,
        	'Nicaragua':6624554,
        	'Niger':24206644,
        	'Nigeria':206139589,
        	'Niue':1626,
        	'North Korea':25778816,
        	'North Macedonia':2083374,
        	'Northern Mariana Islands':57559,
        	'Norway':5421241,
        	'Oman':5106626,
        	'Pakistan':220892340,
        	'Palau':18094,
        	'Panama':4314767,
        	'Papua New Guinea':8947024,
        	'Paraguay':7132538,
        	'Peru':32971854,
        	'Philippines':109581078,
        	'Poland':37846611,
        	'Portugal':10196709,
        	'Puerto Rico':2860853,
        	'Qatar':2881053,
        	'Romania':19237691,
        	'Russia':145934462,
        	'Rwanda':12952218,
        	'Réunion':895312,
        	'Saint Barthelemy':9877,
        	'Saint Helena':6077,
        	'Saint Kitts and Nevis':53199,
        	'Saint Lucia':183627,
        	'Saint Martin':38666,
        	'Saint Pierre & Miquelon':5794,
        	'Samoa':198414,
        	'San Marino':33931,
        	'Sao Tome and Principe':219159,
        	'Saudi Arabia':34813871,
        	'Senegal':16743927,
        	'Serbia':8737371,
        	'Seychelles':98347,
        	'Sierra Leone':7976983,
        	'Singapore':5850342,
        	'Sint Maarten':42876,
        	'Slovakia':5459642,
        	'Slovenia':2078938,
        	'Solomon Islands':686884,
        	'Somalia':15893222,
        	'South Africa':59308690,
        	'South Korea':51269185,
        	'South Sudan':11193725,
        	'Spain':46754778,
        	'Sri Lanka':21413249,
        	'Saint Vincent and the Grenadines':110940,
        	'West Bank and Gaza':5101414,
        	'Sudan':43849260,
        	'Suriname':586632,
        	'Sweden':10099265,
        	'Switzerland':8654622,
        	'Syria':17500658,
        	'Taiwan':23816775,
        	'Tajikistan':9537645,
        	'Tanzania':59734218,
        	'Thailand':69799978,
        	'Timor-Leste':1318445,
        	'Togo':8278724,
        	'Tokelau':1357,
        	'Tonga':105695,
        	'Trinidad and Tobago':1399488,
        	'Tunisia':11818619,
        	'Turkey':84339067,
        	'Turkmenistan':6031200,
        	'Turks and Caicos':38717,
        	'Tuvalu':11792,
        	'U.S. Virgin Islands':104425,
        	'Uganda':45741007,
        	'Ukraine':43733762,
        	'United Arab Emirates':9890402,
        	'United Kingdom':67886011,
        	'US':331002651,
        	'Uruguay':3473730,
        	'Uzbekistan':33469203,
        	'Vanuatu':307145,
        	'Venezuela':28435940,
        	'Vietnam':97338579,
        	'Wallis & Futuna':11239,
        	'Western Sahara':597339,
        	'Yemen':29825964,
        	'Zambia':18383955,
        	'Zimbabwe':14862924
        },
        'US': { // Source: https://www.census.gov/newsroom/press-kits/2019/national-state-estimates.html
          'Alabama': 4903185,
          'Alaska': 731545,
          'Arizona': 7278717,
          'Arkansas': 3017804,
          'California': 39512223,
          'Colorado': 5758736,
          'Connecticut': 3565287,
          'Delaware': 973764,
          'District of Columbia': 705749,
          'Florida': 21477737,
          'Georgia': 10617423,
          'Hawaii': 1415872,
          'Idaho': 1787065,
          'Illinois': 12671821,
          'Indiana': 6732219,
          'Iowa': 3155070,
          'Kansas': 2913314,
          'Kentucky': 4467673,
          'Louisiana': 4648794,
          'Maine': 1344212,
          'Maryland': 6045680,
          'Massachusetts': 6892503,
          'Michigan': 9986857,
          'Minnesota': 5639632,
          'Mississippi': 2976149,
          'Missouri': 6137428,
          'Montana': 1068778,
          'Nebraska': 1934408,
          'Nevada': 3080156,
          'New Hampshire': 1359711,
          'New Jersey': 8882190,
          'New Mexico': 2096829,
          'New York': 19453561,
          'North Carolina': 10488084,
          'North Dakota': 762062,
          'Ohio': 11689100,
          'Oklahoma': 3956971,
          'Oregon': 4217737,
          'Pennsylvania': 12801989,
          'Rhode Island': 1059361,
          'South Carolina': 5148714,
          'South Dakota': 884659,
          'Tennessee': 6829174,
          'Texas': 28995881,
          'Utah': 3205958,
          'Vermont': 623989,
          'Virginia': 8535519,
          'Washington': 7614893,
          'West Virginia': 1792147,
          'Wisconsin': 5822434,
          'Wyoming': 578759,
          'Puerto Rico': 3193694,
          'Virgin Islands': 104452, // Pulled from https://www.worldometers.info/world-population/united-states-virgin-islands-population/
          'Guam': 168510, // Pulled from https://www.worldometers.info/world-population/guam-population/
          'Northern Mariana Islands': 57498// Pulled from https://www.worldometers.info/world-population/northern-mariana-islands-population/
        },
        'China': { // 2018 from http://data.stats.gov.cn/english/easyquery.htm?cn=E0103
          'Beijing': 21540000,
          'Tianjin': 15600000,
          'Hebei': 75560000,
          'Shanxi': 37180000,
          'Inner Mongolia': 25340000,
          'Liaoning': 43590000,
          'Jilin': 27040000,
          'Heilongjiang': 37730000,
          'Shanghai': 24240000,
          'Jiangsu': 80510000,
          'Zhejiang': 57370000,
          'Anhui': 63240000,
          'Fujian': 39410000,
          'Jiangxi': 46480000,
          'Shandong': 100470000,
          'Henan': 96050000,
          'Hubei': 59170000,
          'Hunan': 68990000,
          'Guangdong': 11346000,
          'Guangxi': 49260000,
          'Hainan': 9340000,
          'Chongqing': 31020000,
          'Sichuan': 83410000,
          'Guizhou': 36000000,
          'Yunnan': 48300000,
          'Tibet': 3440000,
          'Shaanxi': 38640000,
          'Gansu': 26370000,
          'Qinghai': 6030000,
          'Ningxia': 6880000,
          'Xinjiang': 24870000
        },
        'Australia': { // Sep 2019 from https://www.abs.gov.au/AUSSTATS/abs@.nsf/DetailsPage/3101.0Sep%202019?OpenDocument
          'New South Wales': 8117976,
          'Victoria': 6629870,
          'Queensland': 5115451,
          'South Australia': 1756494,
          'Western Australia': 2630557,
          'Tasmania': 535500,
          'Northern Territory': 245562,
          'Australian Capital Territory': 428060,
        },
        'Canada': { // Q1 2020 from Statistics Canada. https://www150.statcan.gc.ca/t1/tbl1/en/tv.action?pid=1710000901
          'Newfoundland and Labrador': 521365,
          'Prince Edward Island': 158158,
          'Nova Scotia': 977457,
          'New Brunswick': 779993,
          'Quebec': 8537674,
          'Ontario': 14711827,
          'Manitoba': 1377517,
          'Saskatchewan': 1181666,
          'Alberta': 4413146,
          'British Columbia': 5110917,
          'Yukon': 41078,
          'Northwest Territories': 44904,
          'Nunavut': 39097
        }
      };

      let covidData = [];
      for (let row of grouped){

        if (!exclusions.includes(row.region)) {
          const arr = [];
          let minCases = this.minCasesInCountry
          let region = row.region
          
          if (Object.keys(renames).includes(region)) {
            region = renames[region];
          }
          
          if (perCapita) {
            if (!Object.keys(regionSizes).includes(selectedRegion) || 
                !Object.keys(regionSizes[selectedRegion]).includes(region)) {
              console.log('region not found: ', selectedRegion, '[', region, ']');
              continue;
            }
            let regionSize = regionSizes[selectedRegion][region];
            // Adjust the minimum case count for per capita
            minCases /= regionSize / 1000000;
            
            for (let date of dates) {
              arr.push(row[date] / (regionSize / 1000000));
            }
          } else {
            for (let date of dates) {
              arr.push(row[date]);
            }
          }
          let slope = arr.map((e,i,a) => e - a[i - this.lookbackTime]);

          const cases = arr.map(e => e >= minCases ? e : NaN);
          covidData.push({
            country: region,
            cases,
            slope: slope.map((e,i) => arr[i] >= minCases ? e : NaN),
            maxCases: this.myMax(...cases),
            aboveMinCases: this.myMax(...cases) > minCases
          });

        }
      }

      this.covidData = covidData.filter(e => e.aboveMinCases);
      this.countries = this.covidData.map(e => e.country).sort();
      this.visibleCountries = this.countries;
      const topCountries = this.covidData.sort((a, b) => b.maxCases - a.maxCases).slice(0, 9).map(e => e.country);
      const notableCountries = ['China (Mainland)', 'India', 'US', // Top 3 by population
          'South Korea', 'Japan', 'Taiwan', 'Singapore', // Observed success so far
          'Hong Kong',            // Was previously included in China's numbers
          'Canada', 'Australia']; // These appear in the region selector

      // TODO: clean this logic up later
      // expected behavior: generate/overwrite selected locations if: 1. data loaded from URL, but no selected locations are loaded. 2. data refreshed (e.g. changing region)
      // but do not overwrite selected locations if 1. selected locations loaded from URL. 2. We switch between confirmed cases <-> deaths
      if ((this.selectedCountries.length === 0 || !this.firstLoad) && updateSelectedCountries) {
        this.selectedCountries = this.countries.filter(e => topCountries.includes(e) || notableCountries.includes(e));
      }

      this.firstLoad = false;
    },

    preprocessNYTData(data, type) {
      let recastData = {};
      data.forEach(e => {
        let st = recastData[e.state]  = (recastData[e.state] || {'Province/State': e.state, 'Country/Region': 'US', 'Lat': null, 'Long': null});
        st[fixNYTDate(e.date)] = parseInt(e[type]);
      });
      return Object.values(recastData);

      function fixNYTDate(date) {
        let tmp = date.split('-');
        return `${tmp[1]}/${tmp[2]}/${tmp[0].substr(2)}`;
      }
    },

    formatDate(date) {
      if (!date) {
        return '';
      }

      let [m, d, y] = date.split('/');
      return new Date(2000 + (+y), m-1, d).toISOString().slice(0, 10);
    },

    dateToText(date) {
      if (!date) {
        return '';
      }

      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      let [m, d, y] = date.split('/');
      return monthNames[m-1] + ' ' + d;
    },

    // TODO: clean up play/pause logic
    play() {
      if (this.paused) {

        if (this.day == this.dates.length) {
          this.day = this.minDay;
        }

        this.paused = false;
        this.icon = 'icons/pause.svg';
        setTimeout(this.increment, 200);

      } else {
        this.paused = true;
        this.icon = 'icons/play.svg';
      }

    },

    pause() {
      if(! this.paused) {
        this.paused = true;
        this.icon = 'icons/play.svg';
      }
    },

    increment() {

      if (this.day == this.dates.length || this.minDay < 0) {
        this.day = this.dates.length;
        this.paused = true;
        this.icon = 'icons/play.svg';
      }
      else if (this.day < this.dates.length) {
        if (!this.paused) {
          this.day++;
          setTimeout(this.increment, 200);
        }
      }

    },

    search() {
      this.visibleCountries = this.countries.filter(e => e.toLowerCase().includes(this.searchField.toLowerCase()));
    },

    selectAll() {
      this.selectedCountries = this.countries;
    },

    deselectAll() {
      this.selectedCountries = [];
    },

    toggleHide() {
      this.isHidden = !this.isHidden;
    },

    createURL() {

      let baseUrl = window.location.href.split('?')[0];

      let queryUrl = new URLSearchParams();

      if (this.selectedScale == 'Linear Scale') {
        queryUrl.append('scale', 'linear');
      }

      if (this.selectedData == 'Reported Deaths') {
        queryUrl.append('data', 'deaths');
      }

      if (this.selectedRegion != 'World') {
        queryUrl.append('region', this.selectedRegion);
      }

      // since this rename came later, use the old name for URLs to avoid breaking existing URLs
      let renames = {
        'China (Mainland)': 'China'
      };

      for (let country of this.countries) {
        if (this.selectedCountries.includes(country)) {
          if(Object.keys(renames).includes(country)) {
            queryUrl.append('location', renames[country]);
          } else {
            queryUrl.append('location', country);
          }
        }
      }

      if (this.perCapita) {
        queryUrl.append('perCapita', this.perCapita);
      }

      if (!this.showTrendLine) {
        queryUrl.append('trendline', this.showTrendLine);
      } else if (this.doublingTime != 2) {
        queryUrl.append('doublingtime', this.doublingTime);
      }

      let url = baseUrl + '?' + queryUrl.toString();

      window.history.replaceState( {} , 'Covid Trends', '?'+queryUrl.toString() );

      this.copyToClipboard(url);

    },

    // code to copy a string to the clipboard
    // from https://hackernoon.com/copying-text-to-clipboard-with-javascript-df4d4988697f
    copyToClipboard(str) {
      const el = document.createElement('textarea');  // Create a <textarea> element
      el.value = str;                                 // Set its value to the string that you want copied
      el.setAttribute('readonly', '');                // Make it readonly to be tamper-proof
      el.style.position = 'absolute';
      el.style.left = '-9999px';                      // Move outside the screen to make it invisible
      document.body.appendChild(el);                  // Append the <textarea> element to the HTML document
      const selected =
        document.getSelection().rangeCount > 0        // Check if there is any content selected previously
          ? document.getSelection().getRangeAt(0)     // Store selection if found
          : false;                                    // Mark as false to know no selection existed before
      el.select();                                    // Select the <textarea> content
      document.execCommand('copy');                   // Copy - only works as a result of a user action (e.g. click events)
      document.body.removeChild(el);                  // Remove the <textarea> element
      if (selected) {                                 // If a selection existed before copying
        document.getSelection().removeAllRanges();    // Unselect everything on the HTML document
        document.getSelection().addRange(selected);   // Restore the original selection
      }

      this.copied = true;
      setTimeout(() => this.copied = false, 2500);
    },

    // reference line for exponential growth with a given doubling time
    referenceLine(x) {
      return x * (1 - Math.pow(2, -this.lookbackTime / this.doublingTime));
    }

  },

  computed: {

    filteredCovidData() {
      return this.covidData.filter(e => this.selectedCountries.includes(e.country));
    },

    minDay() {
      let minDay = this.myMin(...(this.filteredCovidData.map(e => e.slope.findIndex(f => f > 0)).filter(x => x != -1)));
      if (isFinite(minDay) && !isNaN(minDay)){
        return minDay + 1;
      } else {
        return -1;
      }
    },

    regionType() {
      switch (this.selectedRegion) {
        case 'World':
          return 'Countries';
        case 'Australia':
        case 'US':
          return 'States';
        case 'China':
          return 'Provinces';
        case 'Canada':
          return 'Provinces';
        default:
          return 'Regions';
      }
    },

    annotations() {

     return [{
        visible: this.showTrendLine,
        x: this.xAnnotation,
        y: this.yAnnotation,
        xref: 'x',
        yref: 'y',
        xshift: -50 * Math.cos(this.graphAttributes.referenceLineAngle),
        yshift: 50 * Math.sin(this.graphAttributes.referenceLineAngle),
        text: this.doublingTime + ' Day Doubling Time<br>of ' + this.selectedData,
        align: 'right',
        showarrow: false,
        textangle: this.graphAttributes.referenceLineAngle * 180 / Math.PI,
        font: {
                family: 'Open Sans, sans-serif',
                color: 'black',
                size: 14
              },
      }];


    },

    layout() {
      let labelSuffix = this.perCapita ? ' per Million' : '';
      return {
        title: 'Trajectory of ' + this.selectedRegion + ' COVID-19 '+ this.selectedData + labelSuffix + ' (' + this.formatDate(this.dates[this.day - 1]) + ')',
        showlegend: false,
        autorange: false,
          xaxis: {
          title: 'Total ' + this.selectedData + labelSuffix,
          type: this.selectedScale == 'Logarithmic Scale' ? 'log' : 'linear',
          range: this.selectedScale == 'Logarithmic Scale' ? this.logxrange : this.linearxrange,
          titlefont: {
            size: 24,
            color: 'rgba(254, 52, 110,1)'
          },
        },
        yaxis: {
          title: 'New ' + this.selectedData + labelSuffix + ' (in the Past Week)',
          type: this.selectedScale == 'Logarithmic Scale' ? 'log' : 'linear',
          range: this.selectedScale == 'Logarithmic Scale' ? this.logyrange : this.linearyrange,
          titlefont: {
            size: 24,
            color: 'rgba(254, 52, 110,1)'
          },
        },
        hovermode: 'closest',
        font: {
                family: 'Open Sans, sans-serif',
                color: 'black',
                size: 14
              },
        annotations: this.annotations
      };
    },

    traces() {

      let showDailyMarkers = this.filteredCovidData.length <= 2;
      let dataFormatString = '';
      let labelSuffix = this.perCapita ? ' per Million' : '';
      
      if (this.perCapita) {
        dataFormatString = ',.2f';
      } else {
        dataFormatString = ',';
      }

      // draws grey lines (line plot for each location)
      let trace1 = this.filteredCovidData.map((e,i) => ({
        x: e.cases.slice(0, this.day),
        y: e.slope.slice(0, this.day),
        name: e.country,
        text: this.dates.map(date => e.country + '<br>' + this.formatDate(date) ),
        mode: showDailyMarkers ? 'lines+markers' : 'lines',
        type: 'scatter',
        legendgroup: i,
        marker: {
          size: 4,
          color: 'rgba(0,0,0,0.15)'
        },
        line: {
          color: 'rgba(0,0,0,0.15)'
        },
        hoverinfo:'x+y+text',
        hovertemplate: '%{text}<br>Total ' + this.selectedData + labelSuffix + ': %{x:' + dataFormatString + '}<br>Weekly ' + this.selectedData + labelSuffix + ': %{y:' + dataFormatString + '}<extra></extra>',
      })
      );

      // draws red dots (most recent data for each location)
      let trace2 = this.filteredCovidData.map((e,i) => ({
        x: [e.cases[this.day - 1]],
        y: [e.slope[this.day - 1]],
        text: e.country,
        name: e.country,
        mode: this.showLabels ? 'markers+text' : 'markers',
        legendgroup: i,
        textposition: 'center right',
        marker: {
          size: 6,
          color: 'rgba(254, 52, 110, 1)'
        },
        hovertemplate: '%{data.text}<br>Total ' + this.selectedData + labelSuffix +': %{x:' + dataFormatString + '}<br>Weekly ' + this.selectedData + labelSuffix + ': %{y:' + dataFormatString + '}<extra></extra>',

       })
      );

      if (this.showTrendLine) {
        let cases = [0.001, 10000000];

        let trace3 = [{
          x: cases,
          y: cases.map(this.referenceLine),
          mode: 'lines',
          line: {
            dash: 'dot',
          },
          marker: {
            color: 'rgba(114, 27, 101, 0.7)'
          },
          hoverinfo: 'skip',
        }];

        // reference line must be last trace for annotation angle to work out
        return [...trace1, ...trace2, ...trace3];

      } else {
        return [...trace1, ...trace2];
      }


    },

    config() {
      return {
        responsive: true,
        toImageButtonOptions: {
          format: 'png', // one of png, svg, jpeg, webp
          filename: 'Covid Trends',
          height: 600,
          width: 600 * this.graphAttributes.width / this.graphAttributes.height,
          scale: 1 // Multiply title/legend/axis/canvas sizes by this factor
        }
      };
    },

    graphData() {
      return {
        uistate: { // graph is updated when uistate changes
          selectedData: this.selectedData,
          selectedRegion: this.selectedRegion,
          selectedScale: this.selectedScale,
          perCapita: this.perCapita,
          showLabels: this.showLabels,
          showTrendLine: this.showTrendLine,
          doublingTime: this.doublingTime,
        },
        traces: this.traces,
        layout: this.layout,
        config: this.config
      };
    },

    xmax() {
      return Math.max(...this.filteredCases, 50);
    },

    xmin() {
      return Math.min(...this.filteredCases, 50);
    },

    ymax() {
      return Math.max(...this.filteredSlope, 50);
    },

    ymin() {
      return Math.min(...this.filteredSlope);
    },

    filteredCases() {
      return Array.prototype.concat(...this.filteredCovidData.map(e => e.cases)).filter(e => !isNaN(e));
    },

    filteredSlope() {
      return Array.prototype.concat(...this.filteredCovidData.map(e => e.slope)).filter(e => !isNaN(e));
    },

    logxrange() {
      return [
        Math.min(1, Math.floor(Math.log10(this.xmin))), 
        Math.ceil(Math.log10(1.5 * this.xmax))
      ];
    },

    linearxrange() {
      return [-0.49*Math.pow(10,Math.floor(Math.log10(this.xmax))), Math.round(1.2 * this.xmax)];
    },

    logyrange() {
      return [
        Math.min(1, Math.floor(Math.log10(this.ymin))),
        Math.ceil(Math.log10(1.5 * this.ymax))
      ];
    },

    linearyrange() {
      let ymax = Math.max(...this.filteredSlope, 50);
      return [-Math.pow(10,Math.floor(Math.log10(ymax))-2), Math.round(1.05 * ymax)];
    },

    xAnnotation() {

      if (this.selectedScale == 'Logarithmic Scale') {
        let x = this.logyrange[1] - Math.log10(this.referenceLine(1));
        if (x < this.logxrange[1]) {
          return x;
        } else {
          return this.logxrange[1];
        }

      } else {
        let x = this.linearyrange[1] / this.referenceLine(1);
        if (x < this.linearxrange[1]) {
          return x;
        } else {
          return this.linearxrange[1];
        }
      }
    },

    yAnnotation() {
      if (this.selectedScale == 'Logarithmic Scale') {
        let x = this.logyrange[1] - Math.log10(this.referenceLine(1));
        if (x < this.logxrange[1]) {
          return this.logyrange[1];
        } else {
          return this.logxrange[1] + Math.log10(this.referenceLine(1));
        }
      } else {
        let x = this.linearyrange[1] / this.referenceLine(1);
        if (x < this.linearxrange[1]) {
          return this.linearyrange[1];
        } else {
          return this.linearxrange[1] * this.referenceLine(1);
        }
      }

    }

  },

  data: {

    paused: true,

    dataTypes: ['Confirmed Cases', 'Reported Deaths'],

    selectedData: 'Confirmed Cases',

    regions: ['World', 'US', 'China', 'Australia', 'Canada'],

    selectedRegion: 'World',

    sliderSelected: false,

    day: 7,

    lookbackTime: 7,

    icon: 'icons/play.svg',

    scale: ['Logarithmic Scale', 'Linear Scale'],

    selectedScale: 'Logarithmic Scale',

    minCasesInCountry: 50,

    dates: [],

    covidData: [],

    countries: [],

    visibleCountries: [],

    isHidden: true,
    
    perCapita: false,

    showLabels: true,

    showTrendLine: true,

    doublingTimes: Array(50).fill(0).map((e,i) => i + 1),

    doublingTime: 2,

    selectedCountries: [],

    searchField: '',

    autoplay: true,

    copied: false,

    firstLoad: true,

    graphAttributes: {
      mounted: false,
      innerWidth: NaN,
      innerHeight: NaN,
      width: NaN,
      height: NaN,
      referenceLineAngle: NaN
    },

  }

})
