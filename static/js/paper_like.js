let allPapers = [];
const allKeys = {
    authors: [],
    keywords: [],
    session: [],
    titles: [],
    recs: [],
}

let order_by = null;
let session_day = null;
let session_number = null;
let likelihood_outdated = false;
let $grid = null;
var iso = null;
let allProj = [];

// From https://stackoverflow.com/questions/7128675/from-green-to-red-color-depend-on-percentage
const percentColors = [
    { pct: 0.0, color: { r: 205, g: 92, b: 92 } },
    { pct: 0.5, color: { r: 243, g: 187, b: 0 } },
    { pct: 1.0, color: { r: 0, g: 176, b: 13 } }
];

const getColorForPercentage = function(pct) {
    for (var i = 1; i < percentColors.length - 1; i++) {
        if (pct < percentColors[i].pct) {
            break;
        }
    }
    var lower = percentColors[i - 1];
    var upper = percentColors[i];
    var range = upper.pct - lower.pct;
    var rangePct = (pct - lower.pct) / range;
    var pctLower = 1 - rangePct;
    var pctUpper = rangePct;
    var color = {
        r: Math.floor(lower.color.r * pctLower + upper.color.r * pctUpper),
        g: Math.floor(lower.color.g * pctLower + upper.color.g * pctUpper),
        b: Math.floor(lower.color.b * pctLower + upper.color.b * pctUpper)
    };
    return 'rgb(' + [color.r, color.g, color.b].join(',') + ')';
}

const scoreToPercentage = function(score){
    var scale = 0.9;
    return Math.max(Math.min((score * scale + 1) * 0.5, 1), 0);
}

const updateCards = (papers) => {
  jQuery('.cards').append(jQuery.map(papers, card_html))
  lazyLoader();
}

const setOrderBy = value => {
  if (value != order_by){
    jQuery('.btn-group.order_by input[value="' + value + '"]').click()
  }
}

const likesChanged = () => {
  // Add to url
  const likestr = jQuery('.myCard[data-likes!=0]').map((i, el) => {
       let val = parseInt(jQuery(el).attr('data-likes'));
       return jQuery(el).attr('data-id') + "=" + val; // (val >= 0 ? "+" : "-") + Math.abs(val); 
     }).toArray().join(",");
  setQueryStringParameter("likes", encodeURIComponent(likestr));

  // Note: we minimize, so like gets low value
  // Only update directly if we are currently sorting by likelihood,
  // otherwise we will update when sorting by likelihood
  if (order_by == "likelihood"){
    computeLikelihood();
  } else {
    likelihood_outdated = true;
  }
}

const addLike = (card, delta) => {
  let mycard = card.parent()

  const likes = parseInt(mycard.attr('data-likes') || '0') + delta;
  mycard.attr('data-likes', likes);
  // Remove responsiveness to mouse temporarily, so card is no longer hovered
  card.css('pointerEvents', "none");
  // Undo after timeout (this way it is queued so we give time for unhover to happen)
  setTimeout(() => { card.css('pointerEvents', "auto") }, 0)

  card.find('.preview.like').toggle(likes > 0);
  card.find('.preview.dislike').toggle(likes < 0);

  likesChanged()
  
}

const setLikesFromStr = (likestr) => {

  var patt = /(([A-Za-z0-9]+)=([-]?\d+))/
  var changed = false;
  jQuery.each(likestr.split(","), (i, s) => { 
    const match = s.match(patt);
    if (match){
      changed = true;

      const id = match[2];
      const likes = parseInt(match[3]);

      const card = jQuery('#card-' + id);
      const mycard = card.parent();

      mycard.attr('data-likes', likes);

      card.find('.preview.like').toggle(likes > 0);
      card.find('.preview.dislike').toggle(likes < 0);
    }

  })

  if (changed) {
    likesChanged();
  }
  
}

const filterGrid = () => {
  $grid.isotope({ filter: function() {
    $this = jQuery(this)
    let matchSession = true
    if ((session_day != 'all') || (session_number != 'all')){
      matchSession = $this.find('.card-session').toArray().some(el => {
        let sessArr = jQuery(el).text().split(" ");
        return (
          ((session_day == 'all') || sessArr[0].toLowerCase().startsWith(session_day)) && 
          ((session_number == 'all') || parseInt(sessArr[1]) == session_number)
        )
      });
    }
    return matchSession && (parseFloat($this.attr('data-search-match')) > 0);
  } })
  jQuery('.filterCount').text( iso.filteredItems.length );
}

const setSessionFromStr = (sessStr) => {
  const sessArr = sessStr.split(" ");
  const sessDay = sessArr[0].toLowerCase(); // Bit hacky fixed length
  const sessDayMatches = jQuery('.btn-group.session_day input').filter((i, el) => {return sessDay.startsWith(jQuery(el).attr('value'))});
  const sessNum = parseInt(sessArr[1]);
  const sessNumMatches = jQuery('.btn-group.session_number input[value="' + sessNum + '"]')
  return setSession(
    sessDayMatches.length > 0 ? sessDayMatches.attr('value') : 'all', 
    sessNumMatches.length > 0 ? sessNumMatches.attr('value') : 'all',
  )
}

const setSession = (day, num) => {
  if (day != session_day){
    jQuery('.btn-group.session_day input[value="' + day + '"]').click()
  }
  if (num != session_number){
    jQuery('.btn-group.session_number input[value="' + num + '"]').click()
  }
}

const doExactSearch = it => {
  return doSearch(it, true)
  // Disabled since it somehow gets overridden by the typahead script
  // Todo some other way to indicate that we perform an exact search?
  // return doSearch((it.charAt(0) == '"' ? '' : '"') + it + (it.charAt(it.length -1) == '"' ? '' : '"'))
}

const doSearch = (it, exact) => {

    $('.typeahead_all').val(it);
    setQueryStringParameter("search", encodeURIComponent(it));

    const gridItems = $grid.find('.grid-item');

    // TODO improve search functionality
    const query = it.trim().toLowerCase();
    if (query.length > 0){
      // const exact = (query.charAt(0) == '"' && query.charAt(query.length - 1) == '"')
      let itarr = (
        exact ? 
        jQuery([query.substring(query.charAt(0) == '"' ? 1 : 0, query.length - (query.charAt(query.length - 1) == '"' ? 1 : 0))]) : 
        jQuery(query.split(" ")).filter((i, el) => { return ['and', 'or', 'on', 'of', 'for', 'by', 'with', 'via', 'in', 'to', 'a', 'an', 'the'].indexOf(el) < 0 })
      );
      gridItems.each((i, el) => {
        el = jQuery(el)
        const haystack = el.text();
        const compute_match = haystack => {
          haystack = haystack.trim().toLowerCase();
          var score = 0;
          jQuery.each(itarr, (i, w) => {
            if (haystack.indexOf(w) > -1){
              score++
            }
          })
          return score;
        }

        const score = (
          compute_match(el.find('.card-title').text()) * 4 + 
          compute_match(el.find('.card-authors').text()) * 2 + 
          compute_match(el.find('.keywords').text()) * 2 + 
          compute_match(el.find('.tldr').text()) * 1
        ) 
        el.attr('data-search-match', score)
      })
    } else {
      gridItems.attr('data-search-match', 1)
    }

    filterGrid();

    if (it.length > 0){
      // Sort descending by filter score
      if (order_by == 'search'){
        $grid.isotope('updateSortData').isotope();
      } else {
        setOrderBy('search')
      }
    } else {
      if (order_by == 'search'){
        // If the ordering was set to search but we cleared the search, we're effectively
        // ordering random, so set ordering to random explicitly to make this clear
        setOrderBy('random')
      }
      
    }
};

const setScore = (card, score) => {
  card.attr('data-score', score);

  const likes = parseInt(card.attr('data-likes'))
  const perc = likes > 0 ? 1. : (likes < 0 ? -1. : scoreToPercentage(score));
  
  $matchperc = card.find('.matchperc');
  $matchperc.width(Math.round(perc * 100) + "%");
  var color = getColorForPercentage(perc);
  $matchperc.css("background-color", color);
}

function computeLikelihood(){

    jQuery('#loading').show();


    // Use kriging.js, see https://oeo4b.github.io/
    var t = [ /* Target variable */ ];
    var x = [ /* X-axis coordinates */ ];
    var y = [ /* Y-axis coordinates */ ];
    jQuery('.myCard[data-likes!=0]').each((i, el) => {
      el = jQuery(el);
      t.push(parseInt(jQuery(el).attr('data-likes')));
      let emb = proj_dict[jQuery(el).attr('data-id')];
      x.push(emb[0]);
      y.push(emb[1]);
    })
    if (t.length > 1){
      // var model = "exponential";
      var model = "gaussian";
      var sigma2 = 0.3, alpha = 1;
      var variogram = kriging.train(t, x, y, model, sigma2, alpha);

      jQuery('.myCard').each( (i, el) => { 
        el = jQuery(el)
        let emb = proj_dict[jQuery(el).attr('data-id')];
        let score = kriging.predict(emb[0], emb[1], variogram)
        setScore(el, score)
      })
    } else {
      jQuery('.myCard').each( (i, el) => { 
        setScore(jQuery(el), 0)
      })
    }
    jQuery('#loading').hide();
    // jQuery('#main-grid').removeClass('grid-non-updating');
    if (order_by == 'likelihood'){
      // Update in realtime, otherwise don't since random will reshuffle as well
      $grid.isotope('updateSortData').isotope();
    }
}


/**
 * START here and load JSON.
 */
const start = () => {
    // jQuery.noConflict(); // Free the dollar sign

    Promise.all([
        jQuery.getJSON('papers.json'),
        jQuery.getJSON('embeddings_tsne.json')
    ]).then(([papers, proj]) => {
        // shuffleArray(papers);

        allPapers = papers;
        allProj = proj;
        proj_dict = {};
        jQuery.each(allProj, (i, el) => { proj_dict[el['id']] = el['pos']});
        calcAllKeys(allPapers, allKeys);
        const allKeysCombined = allKeys['authors'].concat(allKeys['keywords'], allKeys['titles']);
        initTypeAhead(allKeysCombined, '.typeahead_all', 'ilike', (el, it) => { allKeysCombined.indexOf(it) >= 0 ? doExactSearch(it) : doSearch(it) });
        updateCards(allPapers)



        

        // Copy id's into parent cards for sorting
        jQuery('.myCard').each( (i, el) => { 
          el = jQuery(el)
          el.attr('data-id', el.find('.pp-card').attr('data-id'))
          el.attr('data-likes', 0)
          el.attr('data-search-match', 1)
        })



        jQuery('.pp-card .keywords').on('click', 'a', function(){ 
          doExactSearch(jQuery(this).text());
          return false; 
        });

        jQuery('.pp-card .card-session').on('click', function(){ 
          setSessionFromStr(jQuery(this).text());
          return false; 
        });

        $grid = jQuery('.grid');

        $grid.isotope({
          // options
          itemSelector: '.grid-item',
          layoutMode: 'fitRows',
          getSortData: {
            searchMatch: '[data-search-match] parseFloat',
            id: '[data-id]',
            score: '[data-score] parseFloat',
            //maxScore: '[data-max-score] parseFloat',
            // ei: '[data-ei] parseFloat',
            like: '[data-likes] parseInt',
          }
        });
        iso = $grid.data('isotope');

        $grid.on( 'click', '.grid-item .feedback .like', function() {
          addLike(jQuery(this.closest('.pp-card')), 1)
        });
        
        $grid.on( 'click', '.grid-item .feedback .dislike', function() {
          addLike(jQuery(this.closest('.pp-card')), -1)
        });

        if (getUrlParameter("noinfo")){
          jQuery('.remove_alert').click()
        }
        const urlSearch = decodeURIComponent(getUrlParameter("search"));
        const likestr = decodeURIComponent(getUrlParameter("likes"));
        const orderBy = decodeURIComponent(getUrlParameter("order_by")) || 'likelihood';
        const sessionDay = decodeURIComponent(getUrlParameter("session_day")) || 'all';
        const sessionNumber = decodeURIComponent(getUrlParameter("session_number")) || 'all';
        setSession(sessionDay, sessionNumber);
        if (urlSearch !== '') {
          let it = urlSearch;
          allKeysCombined.indexOf(it) >= 0 ? doExactSearch(it) : doSearch(it)
        }
        // setSessionDay(sessionDay)
        // setSessionNumber(sessionNumber)

        // Set the likes
        setLikesFromStr(likestr);

        setOrderBy(orderBy);


    }).catch(e => console.error(e))
}


/**
 * EVENTS
 * **/

jQuery('.btn-group.order_by').on( 'click', 'input', function() {
  order_by = jQuery(this).attr('value');
  setQueryStringParameter("order_by", encodeURIComponent(order_by));
  $grid.isotope('updateSortData').isotope();
  if (order_by == 'random'){
    $grid.isotope({ sortBy: 'random', sortAscending: true });
  } else if(order_by == 'search') {
    $grid.isotope({
      sortBy: ['searchMatch', 'random'],
      sortAscending: {
        'searchMatch': false,
        'random': true
      }
    });
  } else if (order_by == 'likelihood'){
    if (likelihood_outdated){
      computeLikelihood();
    }
    $grid.isotope({ sortBy: ['like', 'score', 'random'], sortAscending: {
        'like': false,
        'score': false,
        'random': true
      } });
  }
});

jQuery('.btn-group.session_day').on( 'click', 'input', function() {
  session_day = jQuery(this).attr('value');
  setQueryStringParameter("session_day", encodeURIComponent(session_day));
  filterGrid();
});

jQuery('.btn-group.session_number').on( 'click', 'input', function() {
  session_number = jQuery(this).attr('value');
  session_number = (session_number == 'all') ? 'all' : parseInt(session_number)
  setQueryStringParameter("session_number", encodeURIComponent(session_number));
  filterGrid();
});

jQuery('.remove_alert').on('click', function() {
  setQueryStringParameter("noinfo", 1)
})

/**
 * CARDS
 */

const keyword = kw => `<a href="#"
                       class="text-secondary text-decoration-none">${kw.toLowerCase()}</a>`

// const card_time_small = (openreview, show) => {
//     const cnt = openreview.content;
//     return show ? (!SITE_ROOT ? `
// <!--    <div class="pp-card-footer">-->
//     <div class="text-center" style="margin-top: 10px;">
//     ${cnt.session.filter(s => s.match(/.*[0-9]/g)).map(
//       (s,i) => `<a class="card-subtitle card-session text-muted" href="?session=${encodeURIComponent(
//         s)}">${s.replace('Session ','')}</a> ${card_live(cnt.session_links[i])} ${card_cal(openreview, i)} `).join(', ')}
//     </div>
// <!--    </div>-->
//     ` : `
// <!--    <div class="pp-card-footer">-->
//     <div class="text-center" style="margin-top: 10px;">
//     ${cnt.session.filter(s => s.match(/.*[0-9]/g)).map(
//       (s,i) => `<a class="card-subtitle card-session text-muted" href="?session=${encodeURIComponent(
//         s)}">${s.replace('Session ','')}</a>`).join(', ')}
//     </div>
// <!--    </div>-->
//     `) : '';
// }

const card_time_small = (openreview, show) => {
    const cnt = openreview.content;
    return show ? `
<!--    <div class="pp-card-footer">-->
    <div class="text-center" style="margin-top: 10px;">
    ${cnt.session.filter(s => s.match(/.*[0-9]/g)).map(
      (s,i) => `<a class="card-subtitle text-muted card-session" href="#">${s.replace('Session ','')}</a> ${card_live(cnt.session_links[i])} ${card_cal(openreview, i)} `).join(', ')}
    </div>
<!--    </div>-->
    ` : '';
}

const card_icon_video = icon_video(16);
const card_icon_cal = icon_cal(16);

const card_live = (link)=> SITE_ROOT ? '' : `<a class="text-muted card-session-link" href="${link}">${card_icon_video}</a>`
const card_cal = (openreview, i)=>  `<a class="text-muted card-session-cal" href="webcal://iclr.github.io/iclr-images/calendars/poster_${openreview.forum}.${i}.ics">${card_icon_cal}</a>`


//language=HTML
const card_html = openreview => `
      <div class="myCard col-xs-6 col-md-4 grid-item">
        <div class="pp-card pp-mode-ilike" data-id="${openreview.content.iclr_id}" id="card-${openreview.content.iclr_id}">
            <div class="pp-card-header">
                <div class="title-wrapper">
                  <div class="preview dislike">
                    <div class="dislike">
                          <i class="fas fa-thumbs-up fa-stack-1x"></i>
                    </div>
                  </div><!--
               --><div class="feedback dislike">
                    <div class="fa-stack fa-lg dislike">
                      <!--<i class="fa fa-circle-thin fa-stack-2x"></i>-->
                      <i class="far fa-thumbs-up fa-stack-1x"></i>
                      <!--<i class="fas fa-times fa-stack-1x"></i>-->
                    </div>
                  </div><!--
               --><div class="title-inner">
                    <a href="${SITE_ROOT}poster_${openreview.content.iclr_id}.html" target="_blank"
                     class="text-muted">
                      <h5 class="card-title" align="center"> ${openreview.content.title} </h5>
                    </a>
                    <h6 class="card-subtitle card-authors text-muted" align="center">
                        ${openreview.content.authors.join(', ')}
                    </h6>
                  </div><!--
               --><div class="feedback like">
                    <div class="fa-stack fa-lg like">
                      <!--<i class="fa fa-circle-thin fa-stack-2x"></i>-->
                      <i class="far fa-thumbs-up fa-stack-1x"></i>
                      <!--<i class="far fa-heart fa-stack-1x"></i>-->
                    </div>
                  </div><!--
               --><div class="preview like">
                    <div class="like">
                        <i class="fas fa-thumbs-up fa-stack-1x"></i>
                    </div>
                  </div>
                  <div class="match">
                      <div class="matchperc"></div>
                  </div>
                </div>
                ${card_time_small(openreview, true)}  
                <center>
                  <img class="lazy-load-img cards_img" data-src="https://iclr.github.io/iclr-images/small/${openreview.content.iclr_id}.jpg" width="80%"/>
                </center>
                <div class="pp-card-detail">
                  <p class="card-text tldr"> ${openreview.content.TLDR}</p>
                  <p class="card-text keywords"><span class="font-weight-bold">Keywords:</span>
                      ${openreview.content.keywords.map(keyword).join(', ')}
                  </p>
                </div>
            </div>
        </div>
      </div>`