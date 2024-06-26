//This code is adapted from the code for the Bowerman & Smith (CogSci 2022) experiment on semantic extension. The original code
//can be found in this repository: https://github.com/kennysmithed/SemanticExtension. Section headers surrounded by asterisks and comments
//prefixed by [KS] have been retained from this original codebase. 

//Global pathing prefix for stimuli
const PREPATH = '../../uw_pictures/'
 
var my_port_number = "/ws4/";

//Initialize jsPsych
var jsPsych = initJsPsych({
  show_progress_bar: true,
  auto_update_progress_bar: false,
  message_progress_bar: 'Training progress',
  on_finish: function () {
    jsPsych.data.displayData("csv"); 
  },
});

//Assign an ID and preload the trial bank.
const PARTICIPANT_ID = jsPsych.randomization.randomID(10)//jsPsych.data.getURLVariable('PROLIFIC_PID');
async function fetchTrialData() {
  //*********** change this to /lem_trials.json for the other condition! ************
  const response = await fetch('../../lem_trials.json');
  if (!response.ok) {
      throw new Error('Could not fetch trials');
  }
  return await response.json();
}

//WAIT for the trial bank to be loaded, then generate new recombined stimuli-prompt sets from the trial banks. 
//This async closes at the very end of the experiment code.
async function initExperiment() {
  try {
      const trialData = await fetchTrialData();
      const trial_bank = trialData

function collectSentences(inputList) {
  const promptDict = {};
  const returnDict = {};

  inputList.forEach(item => {
      const lexNumber = item.lexicalization_number;
      const sentence = item.sentence;
      if (promptDict.hasOwnProperty(lexNumber)) {
          promptDict[lexNumber].push(sentence);
      } else {
          promptDict[lexNumber] = [sentence];
      }
  });

  const promptList = Object.entries(promptDict).map(([key, value]) => {
      return { [key]: [...new Set(value)] };
  });

  promptList.forEach(d => {
      Object.assign(returnDict, d);
  });

  return returnDict;
}

const choiceBanks = collectSentences(trial_bank)

//Simple function to save participant data to server
function save_data(name, data_in) {
  var url = "save_data.php";
  var data_to_send = { filename: name, filedata: data_in };
  fetch(url, {
    method: "POST",
    body: JSON.stringify(data_to_send),
    headers: new Headers({
      "Content-Type": "application/json",
    }),
  });
}

//Function to designate whcih information to save, how, and where
function save_dyadic_interaction_data(data) {
  var survey_response = data.survey_response || '';

  var data_to_save = [
    PARTICIPANT_ID,
    data.trial_index,
    data.trial_type,
    data.time_elapsed,
    data.partner_id,
    data.stimulus,
    data.observation_label,
    data.button_choices,
    data.button_selected,
    data.rt,
    data.score,
    data.target_object,
    survey_response 
  ];
  var line = data_to_save.join(",") + "\n";
  var this_participant_filename = "di_" + PARTICIPANT_ID + ".csv";
  save_data(this_participant_filename, line);
}

var write_headers = {
  type: jsPsychCallFunction,
  func: function() {
    var this_participant_filename = "di_" + PARTICIPANT_ID + ".csv";
    save_data(
      this_participant_filename,
      "PARTICIPANT_ID,trial_index,trial_type,time_elapsed,partner_id,stimulus,observation_label,button1,button2,button_selected,rt,score,target_object,survey_responses\n"
    );
  },
};

//Because we are asynchronously loading trial bank data, we have to declare some functions as "window" (global) when they normally would be limited in scope
//in order for the utilities file to communicate with these scripts. 
window.write_headers = write_headers


//Build a single observation trial from a single underlying trial array. The trial has a nested structure, so
//the items will appear in order and timed according to the duration parameter.
function make_observation_trial(object, total_trials, current_trial) {
  var trial = {
    type: jsPsychHtmlButtonResponse,
    stimulus: function() {
      return '<div class="top-prompt">' + object['context'] + '</div><br><br>' +
             '<img src="' + PREPATH + object['picture'] + '" style="width: 600px; display: block; margin: 0 auto;"><br><br>' +
             '<div class="bottom-prompt"><i style="font-size: 24px;">' + object['sentence'] + '</i></div>';
    },
    choices: [],
    timeline: [
      {
        stimulus: function() {
          return '<div class="top-prompt">' + object['context'] + '</div><br><br>' +
                 '<img src="' + PREPATH + object['picture'] + '" style="width: 600px; display: block; margin: 0 auto;"><br><br>';
        },
        trial_duration: 3000,
      },
      {
        stimulus: function() {
          return '<div class="top-prompt">' + object['context'] + '</div><br><br>' +
                 '<img src="' + PREPATH + object['picture'] + '" style="width: 600px; display: block; margin: 0 auto;"><br><br>' +
                 '<div class="bottom-prompt"><i style="font-size: 24px;">' + object['sentence'] + '</i></div>';
        },
        trial_duration: 6000,
        post_trial_gap: 500,
        data: { trial_type: "observation", observation_label: object['sentence'] },
        on_start: function() {
          jsPsych.setProgressBar(current_trial / total_trials);
        },
        on_finish: function (data) {
          save_dyadic_interaction_data(data);
        },
      }
    ]
  };
  return trial;
}

//Concatenates the observation trials into an observation phase
function build_observation_phase(array) {
  var observation_timeline = [];
  var total_trials = array.length * 2; // Two repetitions of each object
  var current_trial = 0;

  for (let repetition = 0; repetition < 2; repetition++) {
    let shuffled_array = jsPsych.randomization.shuffle(array);
    for (let i = 0; i < shuffled_array.length; i++) {
      current_trial++;
      observation_timeline.push(make_observation_trial(shuffled_array[i], total_trials, current_trial));
    }
  }
  return observation_timeline;
}

var observation_trials = build_observation_phase(trial_bank);

var start_interaction_loop = {
  type: jsPsychCallFunction,
  func: interaction_loop,
};

//Put participants in the waiting room until a suitable partner is found. 
function waiting_room() {
  var waiting_room_trial = {
    type: jsPsychHtmlButtonResponse,
    stimulus: "You are in the waiting room",
    choices: [],
    on_finish: function () {
      jsPsych.pauseExperiment();
    },
  };
  jsPsych.addNodeToEndOfTimeline(waiting_room_trial);
  jsPsych.resumeExperiment();
}

//Again, declare that the waiting room function is global.
window.waiting_room = waiting_room

function waiting_for_partner() {
  end_waiting(); //end any current waiting trial
  var waiting_trial = {
    type: jsPsychHtmlButtonResponse,
    stimulus: "Waiting for partner",
    choices: [],
    on_finish: function () {
      jsPsych.pauseExperiment();
    },
  };
  jsPsych.addNodeToEndOfTimeline(waiting_trial);
  jsPsych.resumeExperiment();
}

window.waiting_for_partner = waiting_for_partner

function end_waiting() {
  if (
    jsPsych.getCurrentTrial().stimulus == "Waiting for partner" ||
    jsPsych.getCurrentTrial().stimulus == "You are in the waiting room"
  ) {
    jsPsych.finishTrial();
  }
}

function partner_dropout() {
  end_waiting();
  var stranded_screen = {
    type: jsPsychHtmlButtonResponse,
    stimulus:
      "<h3>Oh no, something has gone wrong!</h3>\
      <p style='text-align:left'>Unfortunately it looks like something has gone wrong - sorry!</p>\
      <p style='text-align:left'>Clock continue to progress to the final screen and finish the experiment.</p>",
    choices: ["Continue"],
  };
  jsPsych.addNodeToEndOfTimeline(stranded_screen);
  end_experiment();
}

window.partner_dropout = partner_dropout

//At the end of the experiment, ask what the participant thinks the nonce words mean using an embedded JsPsych survey trial. 
function end_experiment(score) {
  var survey_trial = {
    type: jsPsychSurveyText,
    questions: [
      { prompt: "What do you think <b>zop</b> means?" },
      { prompt: "What do you think <b>lem</b> means?" }
    ],
    preamble: "Thank you again for participating in our experiment. Please answer in a few words what you think each of the two made-up words means.",
    button_label: 'End experiment',
    on_finish: function(data) {
      var response_zop = data.response.Q0; 
      var response_lem = data.response.Q1; 
      data.survey_response = response_zop + " | " + response_lem;
      save_dyadic_interaction_data(data);
    }
  }
  var final_screen = {
    type: jsPsychHtmlButtonResponse,
    stimulus:
      "<h3>Finished!</h3>\
      <p style='text-align:left'>Please follow the link below to claim your reward. <b><span style='color:red'>If you do not navigate back to Prolific, you will not receive any payment!</span></b></p>\
      <p style='text-align:left'>" +
      (score > 0
        ? "Congratulations! You will receive a bonus payment of <b>" + (200 + ((36+score)*2))/100 + "</b> GBP. Thank you again for participating in our experiment!"
        : "Unfortunately, you did not score high enough to receive a bonus payment. Thank you for participating!") +
      "</p>\
      <p style='text-align:left'>Your final cumulative score is: <b>" + score + "</b></p>" +
      `<p><a href="https://app.prolific.com/submissions/complete?cc=CI67KCSQ">Click here to return to Prolific and complete the study</a>.</p>`, //COMPLETE WITH PROLIFIC LINK
    choices: [],
    on_finish: function () {
      close_socket();
      jsPsych.endCurrentTimeline();
    },
  };
  jsPsych.addNodeToEndOfTimeline(survey_trial)
  jsPsych.addNodeToEndOfTimeline(final_screen);
  jsPsych.resumeExperiment();
}

/******************************************************************************/
/*** Director trials ****************************************/
/******************************************************************************/

function director_trial(target_object, partner_id) {
  end_waiting();
  //look up label choices depending on object 
  // if (target_object == "object4") {
  //   label_choices = object_4_labels; 
  // } else if (target_object == "object5") {
  //   label_choices = object_5_labels;
  // }
  var label_choices = choiceBanks[target_object['lexicalization_number']]
  //console.log(label_choices)
  //bit of book-keeping on object filename
  //var object_filename = "images/" + target_object + ".jpg";

  var object_filename = PREPATH + target_object['picture']
  console.log(object_filename)
  //subtrial 1 - just show the object
  var subtrial1 = {
    type: jsPsychImageButtonResponse,
    stimulus: object_filename,
    stimulus_width: 600,
    maintain_aspect_ratio: true,
    prompt: "&nbsp;", //placeholder prompt
    choices: label_choices, //these buttons are invisible and unclickable!
    button_html:
      '<button style="visibility: hidden;" class="jspsych-btn">%choice%</button>',
    response_ends_trial: false,
    trial_duration: 500
  };
  //subtrial 2: show the labelled buttons and have the participant select
  var subtrial2 = {
    type: jsPsychImageButtonResponse,
    stimulus: object_filename,
    stimulus_width: 600,
    maintain_aspect_ratio: true,
    prompt: "<br><br>", //placeholder prompt
    choices: label_choices,
    //at the start of the trial, randomise the left-right order of the labels
    //and note that randomisation in data
    on_start: function (trial) {
      var shuffled_label_choices = jsPsych.randomization.shuffle(label_choices);
      trial.choices = shuffled_label_choices;
      trial.data = {
        block: "production",
        button_choices: shuffled_label_choices,
      };
    },
    //at the end, use data.response to figure out
    //which label they selected, and add that to data and save
    on_finish: function (data) {
      var button_number = data.response;
      label_selected = data.button_choices[button_number]; //keep track of this in our variable
      n_clicks_required = label_selected.length; //this determines how many times we click in the loop
      data.button_selected = label_selected; //add this to data so it is saved to data file
      data.trial_type = "director"; //add this to data so it is saved to data file
      data.partner_id = partner_id; //add this to data so it is saved to data file
      save_dyadic_interaction_data(data);
    },
  };

  var message_to_server = {
    type: jsPsychCallFunction,
    func: function () {
      //let the server know what label the participant selected,
      //and some other info that makes the server's life easier
      send_to_server({
        response_type: "RESPONSE",
        participant: PARTICIPANT_ID,
        partner: partner_id,
        role: "Director",
        target_object: target_object,
        response: label_selected,
      });
      jsPsych.pauseExperiment();
    },
  };
  //put the three (TWO) sub-parts plus the message-send together in a single complex trial
  var trial = {
    timeline: [subtrial1, subtrial2, message_to_server],
  };
  jsPsych.addNodeToEndOfTimeline(trial);
  jsPsych.resumeExperiment();
}

window.director_trial = director_trial

/******************************************************************************/
/*** Picture selection trials ****************************************/
/******************************************************************************/

/*
This code is largely the same as the matcher trial at
https://github.com/kennysmithed/SemanticExtension/blob/main/Experiment1Code/shapes_interaction/shapes_interaction.js,
with a few changes to accommodate our new sorting and prompt selection methods. 
*/

function matcher_trial(label, partner_id, object_choices) {
  end_waiting();
  //var object_choices = possible_objects; //global variable defined at top!
  var imageChoices = object_choices.map(function(imageSrc) {
    return `<img src="${imageSrc}" style="width:400px; height:auto;">`; // Set width as needed
  });
  var trial = {
    type: jsPsychHtmlButtonResponse,
    stimulus: label,
    choices: imageChoices,
    button_html:
      '<button class="jspsych-btn">%choice%</button>',
      on_start: function(trial) {
        var shuffled_object_choices = jsPsych.randomization.shuffle(trial.choices);
        trial.choices = shuffled_object_choices;
        trial.data = { button_choices: shuffled_object_choices };
      },
    on_finish: function (data) {
      var button_number = data.response;
      data.trial_type = "matcher";
      data.button_selected = data.button_choices[button_number];
      data.partner_id = partner_id; //add this to data so it is saved to data file
      save_dyadic_interaction_data(data);
      send_to_server({
        response_type: "RESPONSE",
        participant: PARTICIPANT_ID,
        partner: partner_id,
        role: "Matcher",
        director_label: label,
        response: data.button_selected,
        choices: object_choices
      });
      jsPsych.pauseExperiment();
    },
  };
  jsPsych.addNodeToEndOfTimeline(trial);
  jsPsych.resumeExperiment();
}
window.matcher_trial = matcher_trial

/******************************************************************************/
/*** Feedback trials **********************************************************/
/******************************************************************************/

/*
In this condition we implemented a weighting system, where participants would be rewarded more greatly or punished more severely for
disagreements about deontic conditions vs. epistemic ones. For this, we added tracking of a cumulative score (c_score throughout) and 
handling for the cumulative score in the server.py and utlities.js file. 
*/


function display_feedback(score, c_score) {
  end_waiting();
  if (score >= 1) {
    var feedback_stim = "Correct!";
    if (score === 1) {
      feedback_stim += '<br>You have earned ' + score + ' point.'
    }
    else {
      feedback_stim += '<br>You have earned ' + score + ' points.'
    }
  } else {
    var feedback_stim = "Incorrect!"
    if (score === -1){
      feedback_stim += '<br>You have lost ' + -1*score + ' point.'
    }
    else {
      feedback_stim += '<br>You have lost ' + -1*score + ' points.'
    }
    
  }
  feedback_stim += '<br>Your cumulative score is: ' + c_score + '.';


  var feedback_trial = {
    type: jsPsychHtmlButtonResponse,
    stimulus: feedback_stim,
    choices: [],
    trial_duration: 2000,
    on_finish: function (data) {
      data.score = score,
      save_dyadic_interaction_data(data)
      send_to_server({response_type: "FINISHED_FEEDBACK"});
      jsPsych.pauseExperiment();
    },
  };
  jsPsych.addNodeToEndOfTimeline(feedback_trial);
  jsPsych.resumeExperiment();
}


window.display_feedback = display_feedback

/******************************************************************************/
/*** Instruction trials *******************************************************/
/******************************************************************************/

/*
Our experiment provides instructions at three stages: prior to the start of the experiment ("preliminary", at the same time as participant consent), 
prior to observation ("observation"), and prior to interaction. These instructions are heavily adapted from Bowerman & Smith's original template to fit 
our experiment's requirements. 
*/

var preliminary_instructions = {
  type: jsPsychInstructions,
  pages: [
    "<h3>Welcome to the experiment</h3> \
    <p style='text-align:left'>Today you will be participating in a game about learning new words. \
    We have invented two words that don't exist in standard English — \"zop\" and \"lem\" — and given them consistent meanings. \
    But there's a catch - as a participant, you have to figure out what those meanings are.</p> \
    <p style='text-align:left'>The game consists of two phases: TRAINING and INTERACTION. In the TRAINING phase, you will watch a sequence of pictures pass by on your screen. \
    The pictures will be labeled with a sentence that is true in the situation, using one of our made-up words. \
    Pay close attention because some meanings might be difficult!<\p>",
    "<p style='text-align:left'>Hint: Some pictures show situations that can be described as “<b>not allowed</b>…” or “<b>not obliged</b>” and have red frames. \
    Other pictures show situations that can be described as “<b>cannot be…</b>” or “<b>not necessarily</b>” and have blue frames.</p> \
    <p style='text-align:left'>In the INTERACTION phase, we will ask you to apply what you learned in the training phase with another participant who will be your communication partner. \
    You and your partner will take on the roles of SENDER and RECEIVER, alternating after each trial. You will receive additional instructions before the interaction phase.</p>"
  ],
  allow_backward: true,
  show_clickable_nav: true,
  button_label_next: 'Next'
}

var consent_screen = {
  type: jsPsychHtmlButtonResponse,
  stimulus: "<h3>Welcome to the experiment</h3>" +
    "<p style='text-align:left'><strong>Informed Consent Form</strong><br><br>" +
    "This is an experiment about language learning. It will take about 20 minutes to complete. " +
    "You will be compensated by the amount indicated both on Prolific and in the consent form." +
    "This study is being conducted by Dr. Wataru Uegaki (University of Edinburgh) and has been granted ethical approval. <br>" +
    "By agreeing below you indicate that:" +
    "<ul style='text-align:left'>" +
    "<li>You are at least 18 years old.</li>" +
    "<li>You have read the information letter.</li>" +
    "<li>You voluntarily agree to participate, and understand you can stop your participation at any point.</li>" +
    "<li>You agree that your anonymous data may be kept permanently in Edinburgh University storage and may be used for research purposes.</li></ul>" +
    "</p>" +
    "<a href='https://docs.google.com/document/d/e/2PACX-1vTGwG1eIdQpNg83QKnaSKBWvCvpiZJrLDNifXT7qebolmIlPydN3TWlWevBlPQ9bgb0PU0uFvWKeGNR/pub' target = 'blank'>" +
    "Information on the use of your data and your rights as a participant are linked in this document. Please review it carefully before proceeding with the experiment.</a><br><br>",
  choices: ["Yes, I consent to participate"],
};

var instruction_screen_observation = {
  type: jsPsychHtmlButtonResponse,
  stimulus:
  "<h3>Observation Instructions</h3>\
  <p>A sequence of pictures and their labels will appear on your screen. You cannot interact with the experiment at this time, so relax and watch closely and try to figure out the meanings of the words \"zop\" and \"lem\". Please note that the words <b>DO NOT</b> mean “not”!</p>",
  choices: ["Continue"],
};

var instruction_screen_enter_waiting_room = {
  type: jsPsychHtmlButtonResponse,
  stimulus:"<h3>You are about to enter the waiting room for pairing!</h3>\
  <p style='text-align:left'>Once you proceed past this point we will attempt to pair you with another participant. \
  As soon as you are paired you will start to play the communication game together. \
  Once you are paired, your partner will be waiting for you and depends on you to finish the experiment, \
  so please progress through the experiment in a timely fashion, and please if at all possible <b>do not abandon or reload the experiment, \
  or click away from the tab</b>, since this will also end the experiment for your partner.</p>",
  choices: ["Continue"]
};


function show_interaction_instructions() {
  end_waiting();
  var instruction_screen_interaction = {
    type: jsPsychInstructions,
    pages:[
      "<h3>Pre-interaction Instructions</h3> \
<p style='text-align:left'>Time to communicate with your partner!</p> \
<p style='text-align:left'> \
    When you are the SENDER you'll see a picture on your screen, and your job is to select a good label to name it for your partner \
    (the RECEIVER), so that they can select the correct object. \
</p> \
<p style='text-align:left'> \
    When you are the RECEIVER you'll wait for the sender to select a label, \
    then you'll see the label selected by the sender plus four pictures - \
    you just have to click on the picture that is described by the sender's label. \
    This phase consists of <span style'color:blue'<b>48</b></span> iterations, meaning you will be the RECEIVER and the SENDER <b>24 times each</b>.\
</p>",
"<h3>Pre-interaction Instructions: Weighting</h3> \
<p style='text-align:left'> \
    Your response will be scored after every trial: you get a positive score if you correctly identify the sentence from the picture, \
    and a negative score if you pick the wrong sentence. Note that the scoring depends on the type of picture! \
    The score will be <span style='color:blue'>+1</span> if you identify the picture correctly and <span style='color:red'>-1</span> if you choose the wrong one. \
    You will probably get many trials wrong at first, so don’t worry – watch the feedback and try to learn from it! \
</p> \
<p style='text-align:left'> \
    You and your partner will receive a <span style='color:green'>bonus payment</span> at the end if your score is greater than 0. The higher your final score, the higher your bonus! \
</p>"
],
    button_label_next: ["Continue"],
    show_clickable_nav: true,
    allow_backward: true,
    on_finish: function () {
      send_to_server({ response_type: "INTERACTION_INSTRUCTIONS_COMPLETE" });
      jsPsych.pauseExperiment();
    },
  };
  jsPsych.addNodeToEndOfTimeline(instruction_screen_interaction);
  jsPsych.resumeExperiment();
}

window.show_interaction_instructions = show_interaction_instructions

var preload_trial = {
  type: jsPsychPreload,
  auto_preload: true,
};

var ending_trial= {
  type: jsPsychHtmlButtonResponse,
  stimulus: "Thank you for participating in the experiment! Your scores have been recorded for your bonus payment.",
  choices: ['End experiment']
}

window.ending_trial = ending_trial

/******************************************************************************/
/*** Build the timeline *******************************************************/
/******************************************************************************/

/*
[KS] Note that this timeline only takes us as far as the interaction loop, at which point
the rest of the trials will be added dynamically.
*/

var full_timeline = [].concat(
  consent_screen,
  preliminary_instructions,
  preload_trial,
  write_headers,
  instruction_screen_observation,
  observation_trials,
  instruction_screen_enter_waiting_room,
  start_interaction_loop
);;

/******************************************************************************/
/*** Run the timeline *******************************************************/
/******************************************************************************/

jsPsych.run(full_timeline);
  }
//This is the end of enclosing the whole experiment structure in an async-await to preload the trials. if the trials are not accessible, 
//abort and send the message below.
catch (error) {
  console.error('Failed to load trial data:', error);
}
}
//Add an event listener to ensure the experiment is preloaded before trying to run the timeline. 
document.addEventListener('DOMContentLoaded', initExperiment);