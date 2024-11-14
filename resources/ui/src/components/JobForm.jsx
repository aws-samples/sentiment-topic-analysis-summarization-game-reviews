import React, {useState} from "react";
import {useParams, useNavigate} from "react-router-dom";

import { Button, Flex, Heading, Input, Loader, TextAreaField, TextField } from "@aws-amplify/ui-react";

import { useGameContext } from "../contexts/GamesContext";

export default function JobForm() {

    const {gameId} = useParams()
    const navigate = useNavigate();

    const [jobName, setJobName] = useState("");
    const [jobNameError, setJobNameError] = useState("");

    const [jobDescription, setJobDescription] = useState("");
    const [isLoading, setLoading] = useState(false)

    const {addJob, fetchGame} = useGameContext();

    const validateJobName = (name) => {
        if (!name.trim()) {
          return "Job name is required";
        }
        if (name.length < 3) {
          return "Job name must be at least 3 characters long";
        }
        if (name.length > 50) {
          return "Job name must not exceed 50 characters";
        }
        if (!/^[a-zA-Z0-9\s-_]+$/.test(name)) {
          return "Job name can only contain letters, numbers, spaces, hyphens, and underscores";
        }
        return "";
      };
      

    const handleSubmit = async (event) => {
        event.preventDefault();
        const nameError = validateJobName(jobName);
        if (nameError) {
            setJobNameError(nameError);
            return;
        }
        setLoading(true)
        await addJob(gameId, jobName, jobDescription);
        await fetchGame(gameId)
        setLoading(false)
        navigate(`/games/${gameId}`)
    }

    

    return (
        <Flex direction="column">
            <Heading>Create Job {isLoading && <Loader />}</Heading>
            <TextField onChange={(e) => setJobName(e.target.value)}
                descriptiveText="Enter a Job name"
                placeholder=""
                label="Job Name"
                errorMessage={jobNameError}
                hasError={!!jobNameError}
            />
            <TextAreaField onChange={(e) => setJobDescription(e.target.value)} label="Job Description" />

            <Button onClick={handleSubmit} variation="primary">Add Job</Button>

        </Flex>
    )
}