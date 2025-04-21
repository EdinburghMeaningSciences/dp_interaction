//This code is adapted from the code for the Bowerman & Smith (CogSci 2022) experiment on semantic extension. The original code
//can be found in this repository: https://github.com/kennysmithed/SemanticExtension. Section headers surrounded by asterisks and comments
//prefixed by [KS] have been retained from this original codebase. 

//Global pathing prefix for stimuli
const PREPATH = '../assets/'

var my_port_number = "/ws9/";

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
var PARTICIPANT_ID = jsPsych.randomization.randomID(10)//jsPsych.data.getURLVariable('PROLIFIC_PID')
async function fetchTrialData() {
  //*********** change this to /lem_trials.json for the other condition! ************
  const zopResponse = await fetch('zop-trials.json');
  const warmup_trials = await fetch ('../../warmup_trials.json')
  if (!zopResponse.ok) {
      throw new Error('Could not fetch experiment trials');
  }
  if (!warmup_trials.ok) {
    throw new Error('Could not fetch warmup trials');
  }
  const response = await zopResponse.json();
  const warmupTrials = await warmup_trials.json()

  return { response: response, warmupTrials: warmupTrials }

}

async function initExperiment() {
  try {
      const trialData = await fetchTrialData();
      const trial_bank = trialData.response
      const splitTrials = separatePictures(trial_bank)
      const warmupTrials = trialData.warmupTrials

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

//Function to separate the trial items into triangle and circle sets.
function separatePictures(data) {
  const duplicatedData = [];

  data.forEach(item => {
    // Create a copy of the item with only the "circle picture"
    const circlePictureOnly = { ...item };
    delete circlePictureOnly["triangle picture"];
    if ("circle picture" in circlePictureOnly) {
      circlePictureOnly["picture"] = circlePictureOnly["circle picture"];
      circlePictureOnly["shape"] = "circle"
      delete circlePictureOnly["circle picture"];
    }
    duplicatedData.push(circlePictureOnly);

    // Create a copy of the item with only the "triangle picture"
    const trianglePictureOnly = { ...item };
    delete trianglePictureOnly["circle picture"];
    if ("triangle picture" in trianglePictureOnly) {
      trianglePictureOnly["picture"] = trianglePictureOnly["triangle picture"];
      trianglePictureOnly['shape'] = 'triangle'
      delete trianglePictureOnly["triangle picture"];
    }
    duplicatedData.push(trianglePictureOnly);
  });

  return duplicatedData;
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

warmupPath = '../../../warmup_pictures/'
warmupChoices = ['choice 1', 'choice 2', 'choice 3', 'choice 4']
let wrongCount = 0
const maxWrong = 2

function warmup_failed() {
  jsPsych.endExperiment('Warmup failed (too many wrong answers). You have been removed from the experiment. If you believe this is an error, please contact us on Prolific.')
}

function write_warmup_director(target_object) {
  const shuffledChoices = jsPsych.randomization.shuffle([target_object['choice 1'], target_object['choice 2'], target_object['choice 3']]);
  const choices = shuffledChoices.map(function(choice) {
    return choice;
  });

  var trial = {
    type: jsPsychImageButtonResponse,
    stimulus: warmupPath + target_object['given stimulus'],
    choices: choices,
    on_finish: function(data) {
      const chosenPrompt = shuffledChoices[data.response];
      console.log(chosenPrompt)
      warmup_feedback(target_object['correct_choice'], chosenPrompt);
    }
  }
  return trial;
}

function write_warmup_matcher(target_object) {
  const shuffledChoices = jsPsych.randomization.shuffle(warmupChoices.map(x => warmupPath + target_object[x]));
  const choices = shuffledChoices.map(function(imageSrc) {
    return `<img src="${imageSrc}" style="width:400px; height:auto;">`;
   
  });

  var trial = {
    type: jsPsychHtmlButtonResponse,
    stimulus: target_object['given stimulus'],
    choices: choices,
    on_finish: function(data) {
      const chosenFilePath = shuffledChoices[data.response];
      const chosenFileName = chosenFilePath.split('/').pop();
      warmup_feedback(target_object['correct_choice'], chosenFileName);
    }
  }
  return trial;
}

window.write_warmup_matcher

function warmup_feedback(correctChoice, userChoice) {
  if (correctChoice !== userChoice) {
      wrongCount++;
  }
  if (wrongCount >= maxWrong) {
      warmup_failed();
      return false;
  }
  return true;
}

window.warmup_feedback

function buildWarmupTrials(warmupTrials) {
  let trials = [];
  for (const trial of warmupTrials) {
      if (trial.role === 'director') {
          trials.push(write_warmup_director(trial));
      } else {
          trials.push(write_warmup_matcher(trial));
      }
  }
  return trials;
}

window.buildWarmupTrials
warmup_timeline = buildWarmupTrials(warmupTrials)

var initial_warmup_instructions = {
  type: jsPsychHtmlButtonResponse,
  stimulus:
    "<h3>Pre-experiment warmup</h3>\
    <p style='text-align:left'>\
    Before you start the training phase we'll do a short warm-up, which will familiarise you with \
    the experiment interface and allow us to check you understand the task and are paying attention! \
    <b>You need to do well on this warm-up task to proceed to the main experiment!</b> \
    So please read these instructions carefully. Don't worry too much though: these warmups should be very easy!</p>",
  choices: ["Continue"]
}

var sender_instructions = {
  type: jsPsychHtmlButtonResponse,
  stimulus:
  "<h3>Pre-interaction Instructions</h3>\
  <p style='text-align:left'>\
    It is time to interact with your partner! You and your partner will take turns playing as SENDER and RECEIVER.</p> \
    <p style='text-align:left'>\
    When you are the SENDER you'll see a picture on your screen. Your job is to select the best label from a small set of options to name it for the receiver, \
    so that they can select the correct picture from their array.</p>",
  choices: ["Continue to receiver instructions"]
}

var receiver_instructions = {
  type: jsPsychHtmlButtonResponse,
  stimulus:
  "<h3>Pre-interaction Instructions</h3>\
  <p style='text-align:left'>\
    <p style='text-align:left'>\
    When you are the RECEIVER you'll wait for the sender to select a label, then you'll see \
    the label selected by the sender plus an array of several pictures on the screen, and you \
    don't get to see which object was highlighted for the sender! You just have to click on the \
    object that you think is being named by the sender. You'll both get a point for every correct \
    response.</p>",
  choices: ["Continue to interaction"]
}

var warmup_instructions = {
  timeline:[initial_warmup_instructions]
}

//Build a single observation trial from a single underlying trial array. The trial has a nested structure, so
//the items will appear in order and timed according to the duration parameter.
function make_observation_trial(object, total_trials, current_trial) {
  var trial = {
    type: jsPsychHtmlButtonResponse,
    stimulus: function() {
      return '<img src="' + PREPATH + object['picture'] + '" style="width: 450px; display: block; margin: 0 auto;"><br><br>' +
             '<div class="bottom-prompt"><i style="font-size: 24px;">' + object['sentence'] + '</i></div>';
    },
    choices: [],
    timeline: [
      {
        stimulus: function() {
          return '<img src="' + PREPATH + object['picture'] + '" style="width: 450px; display: block; margin: 0 auto;"><br><br>' +
                 '<div class="bottom-prompt"><i style="font-size: 24px;">' + object['sentence'] + '</i></div>';
        },
        trial_duration: 5000,
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
  var total_trials = array.length; // Two repetitions of each object
  var current_trial = 0;

  for (let repetition = 0; repetition < 1; repetition++) {
    let shuffled_array = jsPsych.randomization.shuffle(array);
    for (let i = 0; i < shuffled_array.length; i++) {
      current_trial++;
      observation_timeline.push(make_observation_trial(shuffled_array[i], total_trials, current_trial));
    }
  }
  return observation_timeline;
}

var observation_trials = build_observation_phase(splitTrials);

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
      { prompt: "What was the most difficult part of this game?" },
      { prompt: "What kind of strategy did you use to tackle it?" }
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
    stimulus: function() {
      var bonus = cumulative_score > 0 ? (cumulative_score*3)/100 : 0;
      return `<h3>Finished!</h3>
      <p style='text-align:left'>Please follow the link below to claim your reward. <b><span style='color:red'>If you do not navigate back to Prolific, you will not receive any payment!</span></b></p>
      <p style='text-align:left'>` +
      (cumulative_score > 0
          ? `Congratulations! You will receive a bonus payment of <b>${bonus}</b> GBP. Thank you again for participating in our experiment!`
          : `Unfortunately, you did not score high enough to receive a bonus payment. Thank you for participating!`) +
      `</p>
      <p style='text-align:left'>Your final cumulative score is: <b>${cumulative_score}</b></p>
      <p><a href="https://app.prolific.com/submissions/complete?cc=C12WYY4J">Click here to return to Prolific and complete the study</a>.</p>`; // COMPLETE WITH PROLIFIC LINK
  },
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

window.end_experiment = end_experiment

/******************************************************************************/
/*** Director trials ****************************************/
/******************************************************************************/
function director_trial(target_object, partner_id) {
  end_waiting();

  const label_choices = choiceBanks[target_object['lexicalization_number']];
  console.log(target_object)
  const imageChoices = target_object.object_choices;
  const targetImgPath = PREPATH + target_object['picture'] + '.png';
  const subtrial2 = {
    type: jsPsychHtmlButtonResponse,
    stimulus: function () {
      // DEBUGGING: inspect trial values
      console.log("Rendering director trial for:", target_object);
      console.log("Target image path:", targetImgPath);
      console.log("All image choices:", imageChoices);
    
      const imageHTML = imageChoices.map(imgSrc => {
        const fullPath = imgSrc.includes('assets') ? imgSrc : PREPATH + imgSrc;
        const isTarget = fullPath === targetImgPath;
        return `<img src="${fullPath}" 
                     style="width: 400px; height: auto; margin: 10px; padding: 5px; 
                            ${isTarget ? 'border: 6px solid green;' : 'border: none;'}">`;
      }).join("");
    
      return `
        <div style="text-align:center;">
          <div style="margin-bottom: 20px; font-size: 22px;"><i>${target_object['sentence']}</i></div>
          <div style="display: flex; justify-content: center; flex-wrap: wrap;">
            ${imageHTML}
          </div>
        </div>
      `;
    },
    choices: label_choices,
    on_start: function (trial) {
      const shuffled_label_choices = jsPsych.randomization.shuffle(label_choices);
      trial.choices = shuffled_label_choices;
      trial.data = {
        block: "production",
        button_choices: shuffled_label_choices
      };
    },
    on_finish: function (data) {
      const button_number = data.response;
      const label_selected = data.button_choices[button_number];
      data.button_selected = label_selected;
      data.trial_type = "director";
      data.partner_id = partner_id;
      save_dyadic_interaction_data(data);

      // Notify server of the chosen label
      send_to_server({
        response_type: "RESPONSE",
        participant: PARTICIPANT_ID,
        partner: partner_id,
        role: "Director",
        target_object: target_object,
        response: label_selected
      });

      jsPsych.pauseExperiment();
    }
  };

  jsPsych.addNodeToEndOfTimeline({ timeline: [subtrial2] });
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
  var imageChoices = object_choices.map(function(imageSrc) {
    console.log(imageSrc);
    return `<img src="${imageSrc}" style="width:400px; height:auto;">`; 
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
      data.partner_id = partner_id; 
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
// function display_feedback(score, c_score, label, guess, target) {
//   console.log("Displaying feedback:", { score, c_score, label, guess, target });

//   // Pause the experiment
//   console.log("Pausing experiment for feedback");
//   jsPsych.pauseExperiment();

//   // Define the feedback timeline
//   var feedback_timeline = {
//       timeline: [
//           // Scoring screen
//           {
//               type: jsPsychHtmlKeyboardResponse,
//               stimulus: score >= 1 ? "Correct!" : "Incorrect!" + `<br>Your cumulative score is: ${c_score}.`,
//               choices: "NO_KEYS",
//               trial_duration: 2000, // Show for 2 seconds
//               on_finish: function (data) {
//                   data.score = score;
//                   save_dyadic_interaction_data(data);
//                   console.log('Score displayed');
//               },
//           },
//           // Sender info
//           {
//               type: jsPsychHtmlKeyboardResponse,
//               stimulus: `<div style="width: 50%; float: left;"><p>SENDER SAW: ${target}</p></div>`,
//               choices: "NO_KEYS",
//               trial_duration: 2000, // Show for 2 seconds
//               on_finish: function () {
//                   console.log('Sender info displayed');
//               },
//           },
//           // Receiver info
//           {
//               type: jsPsychHtmlKeyboardResponse,
//               stimulus: `<div style="width: 50%; float: right;"><p>RECEIVER CHOSE: ${guess}</p></div>`,
//               choices: "NO_KEYS",
//               trial_duration: 2000, // Show for 2 seconds
//               on_finish: function () {
//                   console.log('Receiver info displayed');
//               },
//           },
//       ],
//       on_finish: function () {
//           // Resume the experiment after feedback
//           console.log("Resuming experiment after feedback");
//           jsPsych.resumeExperiment();
//       },
//   };

//   // Add the feedback timeline to jsPsych
//   console.log("Adding feedback timeline to experiment");
//   jsPsych.addNodeToEndOfTimeline(feedback_timeline);
// }

// function display_feedback(score, c_score, object_label, guess, target) {
//   end_waiting();

//   // Determine feedback message
//   var feedback_stim = "";
//   if (score >= 1) {
//     feedback_stim = "Correct!";
//     feedback_stim += `<br>You have earned ${score} point${score > 1 ? 's' : ''}.`;
//   } else {
//     feedback_stim = "Incorrect!";
//     feedback_stim += `<br>You have lost ${-1 * score} point${score < -1 ? 's' : ''}.`;
//   }
//   feedback_stim += `<br>Your cumulative score is: ${c_score}.`;
//   // Create the HTML structure for the feedback
//   var feedback_html = `
//     <div style="display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; width: 100vw; height: 100vh; position: fixed; top: 0; left: 0; font-size: 24px; text-align: center;">
      
//       <!-- Top Left Quadrant: Feedback Message -->
//       <div style="display: flex; justify-content: center; align-items: center; border: 2px solid black; padding: 20px; background-color: #f8f8f8;">
//         <div>${feedback_stim}</div>
//       </div>

//       <!-- Top Right Quadrant: "SENDER CHOSE" + label -->
//       <div style="display: flex; justify-content: center; align-items: center; border: 2px solid black; padding: 20px; background-color: #e6f7ff;">
//         <div><strong>SENDER CHOSE</strong><br>${target['sentence']}</div>
//       </div>

//       <!-- Bottom Left Quadrant: "SENDER SAW" + target -->
//       <div style="display: flex; justify-content: center; align-items: center; border: 2px solid black; padding: 20px; background-color: #fff5e6;">
//         <div><strong>SENDER SAW</strong><br><img src="../assets/${target['picture']}.png" style="width:400px; height:auto;"></div>
//       </div>

//       <!-- Bottom Right Quadrant: "RECEIVER CHOSE" + guess -->
//       <div style="display: flex; justify-content: center; align-items: center; border: 2px solid black; padding: 20px; background-color: #f0e6ff;">
//         <div><strong>RECEIVER CHOSE</strong><br>${guess}</div>
//       </div>

//     </div>
//   `;

//   var feedback_trial = {
//     type: jsPsychHtmlButtonResponse,
//     stimulus: feedback_html,
//     choices: [],
//     trial_duration: 7000,
//     on_finish: function (data) {
//       data.score = score;
//       save_dyadic_interaction_data(data);
//       send_to_server({ response_type: "FINISHED_FEEDBACK" });
//       jsPsych.pauseExperiment();
//     },
//   };

//   jsPsych.addNodeToEndOfTimeline(feedback_trial);
//   jsPsych.resumeExperiment();
// }

function display_feedback(score, c_score, label, guess, target, object_label) {
  end_waiting();

  console.log(`***************${object_label}*******************`);
  var feedback_stim = "";
  if (score >= 1) {
    feedback_stim = "Correct!";
    feedback_stim += `<br>You have earned ${score} point${score > 1 ? 's' : ''}.`;
  } else {
    feedback_stim = "Incorrect!";
    feedback_stim += `<br>You have lost ${-1 * score} point${score < -1 ? 's' : ''}.`;
  }
  feedback_stim += `<br>Your cumulative score is: ${c_score}.`;

  console.log("++++++++++++" + JSON.stringify(object_label) + "+++++++++++++");

  var feedback_html = `
    <div style="display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; 
                width: 100vw; height: 100vh; position: fixed; top: 0; left: 0; font-size: 24px; 
                text-align: center;">
      
      <!-- Top Left Quadrant: Feedback Message -->
      <div id="quadrant-1" style="display: flex; justify-content: center; align-items: center; 
                                   border: 2px solid black; padding: 20px; background-color: #f8f8f8; 
                                   opacity: 0; transition: opacity 1s;">
        <div>${feedback_stim}</div>
      </div>

      <!-- Top Right Quadrant: "SENDER CHOSE" + label -->
      <div id="quadrant-3" style="display: flex; justify-content: center; align-items: center; 
                                   border: 2px solid black; padding: 20px; background-color: #e6f7ff; 
                                   opacity: 0; transition: opacity 1s;">
        <div><strong>SENDER CHOSE</strong><br>${object_label}</div>
      </div>

      <!-- Bottom Left Quadrant: "SENDER SAW" + target (Image) -->
      <div id="quadrant-2" style="display: flex; justify-content: center; align-items: center; 
                                   border: 2px solid black; padding: 20px; background-color: #fff5e6; 
                                   opacity: 0; transition: opacity 1s;">
        <div><strong>SENDER SAW</strong><br>
          <img src="../assets/${target['picture']}.png" alt="Target Image" 
               style="width: 400px; height: auto; border: 2px solid black;">
        </div>
      </div>

      <!-- Bottom Right Quadrant: "RECEIVER CHOSE" + guess -->
      <div id="quadrant-4" style="display: flex; justify-content: center; align-items: center; 
                                   border: 2px solid black; padding: 20px; background-color: #f0e6ff; 
                                   opacity: 0; transition: opacity 1s;">
        <div><strong>RECEIVER CHOSE</strong><br>${guess}</div>
      </div>

    </div>
  `;

  function revealQuadrants() {
    setTimeout(() => { document.getElementById("quadrant-1").style.opacity = 1; }, 0);    // TL
    setTimeout(() => { document.getElementById("quadrant-2").style.opacity = 1; }, 2000); // BL
    setTimeout(() => { document.getElementById("quadrant-3").style.opacity = 1; }, 5000); // TR
    setTimeout(() => { document.getElementById("quadrant-4").style.opacity = 1; }, 8000); // BR
  }

  var feedback_trial = {
    type: jsPsychHtmlButtonResponse,
    stimulus: feedback_html,
    choices: [],
    trial_duration: 14000,
    on_load: revealQuadrants, 
    on_finish: function (data) {
      data.score = score;
      save_dyadic_interaction_data(data);
      send_to_server({ response_type: "FINISHED_FEEDBACK" });
      jsPsych.pauseExperiment();
    },
  };

  jsPsych.addNodeToEndOfTimeline(feedback_trial);
  jsPsych.resumeExperiment();
}


// function display_feedback(score, c_score, label, guess, target) {
//   end_waiting();
//   if (score >= 1) {
//     var feedback_stim = "Correct!";
//     if (score === 1) {
//       feedback_stim += '<br>You have earned ' + score + ' point.'
//     }
//     else {
//       feedback_stim += '<br>You have earned ' + score + ' points.'
//     }
//   } else {
//     var feedback_stim = "Incorrect!"
//     if (score === -1){
//       feedback_stim += '<br>You have lost ' + -1*score + ' point.'
//     }
//     else {
//       feedback_stim += '<br>You have lost ' + -1*score + ' points.'
//     }
    
//   }
//   feedback_stim += '<br>Your cumulative score is: ' + c_score + '.';


//   var feedback_trial = {
//     type: jsPsychHtmlButtonResponse,
//     stimulus: feedback_stim,
//     choices: [],
//     trial_duration: 2000,
//     on_finish: function (data) {
//       data.score = score,
//       save_dyadic_interaction_data(data)
//       send_to_server({response_type: "FINISHED_FEEDBACK"});
//       jsPsych.pauseExperiment();
//     },
//   };
//   jsPsych.addNodeToEndOfTimeline(feedback_trial);
//   jsPsych.resumeExperiment();
// }


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
    <p style='text-align:left'>Today you will be participating in a game about communication. </p> \
    <p style='text-align:left'>The game consists of two phases: TRAINING and INTERACTION. In the TRAINING phase, you will watch a sequence of pictures pass by on your screen, \
    along with a short description of the situation shown in the picture. \
    Pay close attention because some meanings might be a little complex! </p>\
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
  <p style='text-align:left'>You have successfully completed the warm-up trials! <br><br>\
  Now it's time to learn. A sequence of pictures and their labels will appear on your screen. You cannot interact with the experiment at this time, so relax and watch closely. <br><br>\
  Note: you will see that pictures with triangles will appear in a black frame while pictures with circles will appear without a frame. The presence/absence of the frame will be important later in the interaction phase, but don’t worry about the frames for now!",
  choices: ["Continue"],
};

window.instruction_screen_observation = instruction_screen_observation

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
    pages: [
      "<h3>Pre-interaction Instructions</h3> \
      <p style='text-align:left'>Time to communicate with your partner!</p> \
      <p style='text-align:left'> \
          When you are the SENDER you'll see a picture on your screen, and your job is to select a good label to name it for your partner \
          (the RECEIVER), so that they can select the correct object. \
      </p> \
      <p style='text-align:left'> \
          When you are the RECEIVER you'll wait for the sender to select a label, \
          then you'll see the label selected by the sender plus a set of possible pictures - \
          you just have to click on the picture that is described by the sender's label. \
          This phase consists of <span style='color:blue'><b>64</b></span> iterations, meaning you will be the RECEIVER and the SENDER <b>32 times each</b>.\
      </p>",
      "<h3>Pre-interaction Instructions: Weighting</h3> \
      <p style='text-align:left'> \
          Your response will be scored after every trial: you get a positive score if the receiver correctly identifies the picture from the sender's description, and a negative score if the receiver picks the wrong picture. <br><br>\
          You and your partner will receive a bonus payment at the end if your score is greater than 0. The higher your final score, the higher your bonus!<br><br> \
          <b>Note that the scoring depends on the type of picture.</b> If the picture shown to the sender consists of <b>triangles</b> (indicated by a black frame), the score will be  <span style='color:blue'><b>+2</b></span> if the receiver identifies the picture correctly and  <span style='color:red'><b>-2</b></span> if the receiver chooses the wrong picture. If the picture consists of <b>circles</b> (indicated by the lack of a frame), the score will be +1 if the receiver identifies the picture correctly and -1 if the receiver chooses the wrong picture. <br><br>\
          You will probably get some wrong at first, so watch the feedback and try to learn from it!\
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
  // consent_screen,
  // preliminary_instructions,
  // preload_trial,
  // write_headers,
  // warmup_instructions,
  // warmup_timeline,
  // instruction_screen_observation,
  // observation_trials,
  sender_instructions,
  receiver_instructions,
  instruction_screen_enter_waiting_room,
  start_interaction_loop
);

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