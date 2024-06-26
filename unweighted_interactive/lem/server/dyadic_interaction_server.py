# This code, including its comments, was largely written by Kenny Smith as part of Bowerman & Smith (2022). We have made changes
# in only a few places:
#   - Scoring, both trial-by-trial and cumulatively, in handle_matcher_response.
#   - Helper functions for trial sequence generation (shuffle, collect_prompts, collect_sentences) and modifications to trials as needed to accommodate. 
#   - Pathing to stimulus objects and trial data for our experiment structure.
# -*- coding: utf-8 -*-

##############
##### Python sever interacting with javascript client
##############

# See dyadic_interaction.js for a summary of the communication channel - we are using
# json-encoded dictionaries to send messages back and forth between server and client.

# Each message from the server to the client includes a key command_type which
# lets the client know what action to take.

# Each message from the client to the server includes a key response_type, which
# indicates the kind of response the client is providing.


##############
##### Libraries
##############

# NB this loads the code from the websocket_server folder, which needs to be in the
# same directory as this file.
from websocket_server import WebsocketServer
import random
import json
from copy import deepcopy
import re
import os

max_timediff_before_timeout = 1600
######################
##### Globals to manage experiment progress
######################

# We use several global variables to keep track of important information on
# connected clients, which stage of the experiment they are at etc - then when
# we receive a response from a client we can consult this information to see
# where they are in the experiment and what they should do next.

# The main global variable is a dictionary, global_participant_data
# Each connected client has an entry in here, indexed by their ID (an integer assigned
# when they connect). Stored alongside their entry is all the information we need to guide
# them through the experiment, including their client_info (details of the socket etc
# that is required for message passing), the ID of their partner, their current role (e.g.
# director or matcher), their list of trials, the trial counter showing where they are in
# the experiment.
# Keys are client_info, partner, role, trial_list, shared_trial_counter, exp_score, lex_condition
global_participant_data = {}

# Simply a list of client IDs for clients who are in the waiting room waiting to be paired
unpaired_clients = []

# The list of phases in the experiment - clients progress through this list
# ***NB phases have to be uniquely named***, because we use index() to identify
# where in the experiment the client is.
phase_sequence = ['Start','PairParticipants','Interaction','End']

# In this experiment the director is prompted with a target object and asked to provide a
# label for the matcher, who then guesses what the target object was. That means we need a
# list of target objects - this is it! Note that object 4 is 3 times as frequent as object 5.
target_list = None#["epiImp", "epiNonnec", "deonImp", "deonNonnec"]*2

prepath = '../../uw_pictures/'

def collect_prompts(input_list):
    prompt_dict = {}
    return_dict = {}
    for item in input_list:
        lex_number = item.get('lexicalization_number')
        picture_path = prepath + item.get('picture')
        if lex_number in prompt_dict:
            prompt_dict[lex_number].append(picture_path)
        else:
            prompt_dict[lex_number] = [picture_path]
    prompt_list = [{key: list(set(value))} for key, value in prompt_dict.items()]
    for d in prompt_list:
        return_dict.update(d)
    return return_dict

def collect_sentences(input_list):
    prompt_dict = {}
    return_dict = {}
    for item in input_list:
        lex_number = item.get('lexicalization_number')
        sentence = item.get('sentence')
        if lex_number in prompt_dict:
            prompt_dict[lex_number].append(sentence)
        else:
            prompt_dict[lex_number] = [sentence]
    prompt_list = [{key: list(set(value))} for key, value in prompt_dict.items()]
    for d in prompt_list:
        return_dict.update(d)
    return return_dict

##############
##### Utility functions
##############

def ping_all(list_of_ids):
	for client_id in list_of_ids:
		send_message_by_id(client_id,{"command_type":"Ping"})

# Returns randomised copy of l, i.e. does not shuffle in place
def shuffle(l):
    return random.sample(l, len(l))

# Converts message string to JSON string and sends to client_id.
# See below for explanation of how client_id indexes into global_participant_data
def send_message_by_id(client_id,message):
    client = global_participant_data[client_id]['client_info']
    server.send_message(client,json.dumps(message))

# Checks that all clients listed in list_of_ids are still connected to the server -
# if so, clients will be in global_participant_data
def all_connected(list_of_ids):
    connected_status = [id in global_participant_data for id in list_of_ids]
    if sum(connected_status)==len(list_of_ids):
        return True
    else:
        return False

# Called when a client drops out, used to notify any clients who are still connected
# that this leaves them stranded.
def notify_stranded(list_of_ids):
    for id in list_of_ids:
        if id in global_participant_data:
            #this will notify the participant and cause them to disconnect
            send_message_by_id(id,{"command_type":"PartnerDropout"})



######################
##### Handling clients connecting, disconnecting, sending messages
######################

# Called for every client connecting (after handshake)
# Initialiases that client in global_participant_data, then sends them to the
# "Start" phase of the experiment
# client objects passed over from the websocket are dictionaries including an id
# key (the client's integer identifier) and a client_info key, which contains
# technical details needed to communicate with this client via the socket
def new_client(client, server):
    client_id = client['id']
    print("New client connected and was given id %d" % client_id)
    global_participant_data[client_id] = {'client_info':client, 'score': 0}
    #give them the instructions for the first phase
    enter_phase(client_id,"Start")


# Called for every client disconnecting
# Finds all partners and notifies (NB this will have no effect if experiment is over)
# Remove the client from unpaired_clients if appropriate
# Remove the client from global_participant_data
def client_left(client, server):
    client_id = client['id']
    print("Client(%d) disconnected" % client['id'])
    if client_id in unpaired_clients:
        unpaired_clients.remove(client_id)
    # If they have a partner, and if you are not leaving because you are at the End state,
    # notify partner that they have been stranded
    if 'partner' in global_participant_data[client_id]:
        if global_participant_data[client_id]['phase']!='End':
            partner = global_participant_data[client_id]['partner']
            notify_stranded([partner])
    del global_participant_data[client_id]


# Called when the server receives a message from the client.
# Simply parses the message to a dictionaruy using json.loads, reads off
# the response_type, and passes to handle_client_response
def message_received(client, server, message):
	client_id = client['id']
	print("Client(%d) said: %s" % (client_id, message))
	
	#OK, now we have to handle the various possible responses
	response = json.loads(message)
	response_code =  response['response_type']
	#if it's not just a ping or pong
	if response_code not in ["Pong"]:
		#if they have a partner, ping partner to check for problems
		if 'partner' in global_participant_data[client_id]:
			partner_id = global_participant_data[client_id]['partner']
			ping_all([partner_id]) #will hopefully detect closed sockets?
	handle_client_response(client_id,response_code,response)

##########################
### Management of phases
##########################

# We use a list of named phases to manage client progression through the experiment -
# when one phase ends they move onto the next, which determines what messages they
# will receive from the server.
# ***NB phases have to be uniquely named***, because we are using index() to identify
# where in the experiment the client is.

# Simply looks up the client's current phase and moves them to the next phase
def progress_phase(client_id):
	current_phase = global_participant_data[client_id]['phase']
	current_phase_i = phase_sequence.index(current_phase)
	next_phase_i = current_phase_i+1
	next_phase = phase_sequence[next_phase_i]
	enter_phase(client_id,next_phase)

# enter_phase triggers actions associated with that phase.
# Start: immediately progress to the next phase
# PairParticipants: attempt to pair immediately with anyone in the waiting room,
# otherwise send to the waiting room
# Interaction: enter interaction trials
# End: send quit command
def enter_phase(client_id, phase):
    global_participant_data[client_id]['phase'] = phase

    if phase == 'Start':
        global_participant_data[client_id]['c_score'] = 0
        progress_phase(client_id)
    elif phase == 'PairParticipants':
        # ***** Change this to the correct json file for the lexical condition *****
        trial_path = os.path.join('..', '..', '..', 'lem_trials.json')
        with open(trial_path, 'r') as f:
            trial_bank = json.load(f)

        send_message_by_id(client_id, {"command_type":"WaitingRoom"})
        unpaired_clients.append(client_id)
        
        if len(unpaired_clients) % 2 == 0:
            unpaired_one = unpaired_clients.pop(0)
            unpaired_two = unpaired_clients.pop(0)

            global_participant_data[unpaired_one]['partner'] = unpaired_two
            global_participant_data[unpaired_two]['partner'] = unpaired_one

            target_list = random.sample(trial_bank, len(trial_bank)) + random.sample(trial_bank, len(trial_bank))
            shuffled_targets = shuffle(target_list)
            matcher_targets = collect_prompts(shuffled_targets)
            global_participant_data[unpaired_one]['matcher_targets'] = matcher_targets
            global_participant_data[unpaired_two]['matcher_targets'] = matcher_targets

            # picture_stimuli_map = get_unique_pictures(trial_bank)
            # picture_trials = generate_picture_trials(picture_stimuli_map)
            # extended_trial_list = shuffled_targets + picture_trials
            
            for c in [unpaired_one, unpaired_two]:
                global_participant_data[c]['trial_list'] = shuffled_targets
                global_participant_data[c]['shared_trial_counter'] = 0
                progress_phase(c)
    elif phase == 'Interaction':
        send_instructions(client_id, phase)
    elif phase == 'End':
        send_message_by_id(client_id, {"command_type": "EndExperiment", "final_score": global_participant_data[client_id]['score']})


#################
### Client loop, handling various client responses
#################

# For some responses, how we handle depends on client phase
# Response_code can be
# CLIENT_INFO: the client passing over some info, in this case just a unique identifier
# INTERACTION_INSTRUCTIONS_COMPLETE: client has finished reading the pre-interaction instructions
# RESPONSE: if the client is in the Director role, this means they have produced a label which
# can now be passed to the matcher. If the client is the Matcher, they have made their selection based
# on the clue provided by the director.
# FINISHED_FEEDBACK: the client has finished looking at the feedback screen indicating their
# success in the interaction.
# NONRESPONSIVE_PARTNER: the client is indicating that their partner has become non-responsive (NB this is
# not implemented in the client)

def handle_client_response(client_id,response_code,full_response):
    print('handle_client_response',client_id,response_code,full_response)

    # PING
    if response_code=='Ping':
        send_message_by_id(client_id,{"command_type":"Pong"})
    # client is passing in a unique ID, simply associate that with this client
    if response_code=='CLIENT_INFO':
        global_participant_data[client_id]['participantID']=full_response['client_info']

    #interaction, instructions complete, can initiate actual interaction
    elif response_code=='INTERACTION_INSTRUCTIONS_COMPLETE':
        initiate_interaction(client_id)

    #response returned from director or matcher respectively
    elif response_code=='RESPONSE' and full_response['role']=='Director':
        handle_director_response(client_id,full_response)
    elif response_code=='RESPONSE' and full_response['role']=='Matcher':
        handle_matcher_response(client_id,full_response)

    #interaction feedback complete, next trial please
    elif response_code=='FINISHED_FEEDBACK':
        swap_roles_and_progress(client_id)

    #client reporting a non-responsive partner
    elif response_code=='NONRESPONSIVE_PARTNER':
        pass #not doing anything special with this - the participant reporting
		#the problem leaves, so for their partner it will be as if they have
		#dropped out

#################
### Interaction, handles trial progression etc
#################

# Runs when participants complete instructions.
# Need to waits until both participants are ready to progress - use the role key for this,
# mark participants as ReadyToInteract when they indicate they have finished reading the instructions.
# Then when both participants are ready we randomly assigns roles of Director and Matcher and
# start the first interaction trial.
def initiate_interaction(client_id):
    partner_id = global_participant_data[client_id]['partner']
    list_of_participants = [client_id,partner_id]
    #checking both players are still connected, to avoid one being left hanging
    if not(all_connected(list_of_participants)):
        notify_stranded(list_of_participants)
    else:
        send_message_by_id(client_id,{"command_type":"WaitForPartner"})
        partner_role = global_participant_data[partner_id]['role']
        #if your partnetr is ready to go, let's go!
        if partner_role=='ReadyToInteract':
            print('Starting interaction')
            #allocate random director and matcher, and run start_interaction_trial for both clients
            for client, role in zip(list_of_participants,shuffle(["Director", "Matcher"])):
                global_participant_data[client]['role'] = role
            start_interaction_trial(list_of_participants)
        else: #else mark you as ready to go, so you will wait for partner
            global_participant_data[client_id]['role']='ReadyToInteract'


# Interaction trial - sends director trial instruction to director and wait instruction to matcher
# For director, we need to send the D command_type, with the prompt_word and also the partner_id
# (the partner_id is just sent so that the client can record this in the data file it produces).
def start_interaction_trial(list_of_participants):
    #check everyone is still connected!
    if not(all_connected(list_of_participants)):
        notify_stranded(list_of_participants)
    else:
        #figure out who is the director
        director_id = [id for id in list_of_participants if global_participant_data[id]['role']=='Director'][0]
        #retrieve their trial list and trial counter
        trial_counter = global_participant_data[director_id]['shared_trial_counter']
        trial_list = global_participant_data[director_id]['trial_list']
        ntrials = len(trial_list)
        #check that the director has more trials to run - if not, move to next phase
        if trial_counter>=ntrials:
            for c in list_of_participants:
                progress_phase(c)
        else: #otherwise, if there are still trials to run
            #retrieve the info we need from global_participant_data
            matcher_id = global_participant_data[director_id]['partner']
            matcher_participant_id = global_participant_data[matcher_id]['participantID']
            target = trial_list[trial_counter]
            trial_lex_number = target['lexicalization_number']
            for c in list_of_participants:
                this_role = global_participant_data[c]['role']
                if this_role=='Director': #send the appropriate instruction to the Director
                    instruction_string = {"command_type":"Director",
                                            "target_object":target,
                                            "partner_id":matcher_participant_id,
                                            "lexicalization_number": trial_lex_number}
                    print("Sending to director_id {}: {}".format(director_id, instruction_string))
                else: #and tell the matcher to wait
                    instruction_string = {"command_type":"WaitForPartner"}
                send_message_by_id(c,instruction_string)


# When director responds, all we need to do is relay the clue word to the matcher. Matcher needs
# command_type M, the prompt_word is the director's response value, and we also send over the
# matcher's array of options (hard-wired to object 4 and object 5) and the director's participant ID
#so the matcher can record this in their data file for us.
def handle_director_response(director_id,director_response):
    print('handle_director_response',director_response)
    matcher_id = global_participant_data[director_id]['partner']
    trial_n = global_participant_data[director_id]['shared_trial_counter']
    lex_number = global_participant_data[director_id]['trial_list'][trial_n]['lexicalization_number']
    if not(all_connected([matcher_id])): #the usual check that everyone is still connected
        notify_stranded([director_id])
    else:
        #note that director_response['response'] is the clue word the director sent us
        director_participant_id=global_participant_data[director_id]['participantID']
        object_choices = global_participant_data[director_id]['matcher_targets'][lex_number]
        send_message_by_id(director_id,{"command_type":"WaitForPartner"})
        send_message_by_id(matcher_id,
                            {"command_type":"Matcher",
                                "director_label":director_response['response'],
                                "object_choices":object_choices,
                                "partner_id":director_participant_id})

# When the matcher responds with their guess, we need to send feedback to matcher + director.
# In this experiment the feedback includes information on success/failure, but also some more
# detailed info on what common guesses and the best possible clue word would have been - these
# are just set to ??? here, since the code for that is still to be written!
# Both clients are sent a feedback command: command_type F, then multiple pieces of info including
# score, the intended target, the clue provided, etc etc
# Wataru: this is where we need to implement the weighting
def handle_matcher_response(matcher_id,matcher_response):
    print("in handle_matcher_response")
    director_id = global_participant_data[matcher_id]['partner']
    if not(all_connected([director_id,matcher_id])):
        notify_stranded([director_id,matcher_id])
    else:
        #easiest way to access what the target was is to look it up in the director's trial list
        trial_n = global_participant_data[director_id]['shared_trial_counter']
        target = global_participant_data[director_id]['trial_list'][trial_n]
        #info on the clue the director provided and the matcher's guess are included in the matcher's response
        label = target['picture']
        guess = matcher_response['response']
        print(f"LABEL: {label} ***************** GUESS: {guess}")

        def check_guess(f1, f2):
            f1_fname = f1.strip()
            f2_fname = re.search(r'src="\.\./pictures/([^"]+)"', f2).group(1)
            if f1_fname == f2_fname:
                return True
            else:
                return False

        if check_guess(label, guess):
            score = 1
        else:
            score = -1
        
        global_participant_data[director_id]['score'] += score
        global_participant_data[matcher_id]['score'] += score

        feedback = {"command_type":"Feedback","score":score,
                    "target":target,"label":label,"guess":guess, 'c_score': global_participant_data[matcher_id]['score']}
        for c in [matcher_id,director_id]: #send to both clients
            send_message_by_id(c,feedback)



# Each client comes here when they signal they are done with feedback from an interaction trial.
# The first client who returns will set their role to 'WaitingToSwitch'.
# The second client to return will then trigger the next trial, then we can use the role of that
# second client to figure out who will be director and matcher at the next trial.
def swap_roles_and_progress(client_id):
    print('swap roles',client_id)
    partner_id = global_participant_data[client_id]['partner']
    if not(all_connected([client_id,partner_id])):
        notify_stranded([client_id,partner_id])
    else:
        #increment global counter - both participants will do this independently when they reach this point
        global_participant_data[client_id]['shared_trial_counter']+=1

        this_client_role = global_participant_data[client_id]['role']
        partner_role = global_participant_data[partner_id]['role']
        #If your partner is already ready, then switch roles and progress
        if partner_role=='WaitingToSwitch':
            if this_client_role=='Director': #if you were director for this trial then
                global_participant_data[client_id]['role'] = "Matcher" #next time you will be Matcher...
                global_participant_data[partner_id]['role'] = "Director" #..and your partner will be Director
            else:
                global_participant_data[client_id]['role'] = "Director" #otherwise the opposite
                global_participant_data[partner_id]['role'] = "Matcher"
            #next trial
            start_interaction_trial([client_id,partner_id])
        #Otherwise your partner is not yet ready, so just flag up that you are
        else:
            global_participant_data[client_id]['role'] = "WaitingToSwitch"



####################
### Instructions between blocks
####################

# Fairly simple, just send over a command_typ I message to the client, with instructon_type set to "Interaction"
def send_instructions(client_id,phase):
    if phase=='Interaction':
        #set role
        global_participant_data[client_id]['role'] = "ReadingInstructions"
        send_message_by_id(client_id,{"command_type":"Instructions","instruction_type":"Interaction"})

#######################
### Start up server
#######################

PORT=9004 #this will run on port 9004

#standard stuff here from the websocket_server code
print('starting up')
server = WebsocketServer(PORT,'0.0.0.0')
server.set_fn_new_client(new_client)
server.set_fn_client_left(client_left)
server.set_fn_message_received(message_received)
server.run_forever()
