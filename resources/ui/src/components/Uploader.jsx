import React from "react";
import CSVUpload from './Dropzone';
import { useState } from 'react';
import { Button, Card, Heading, Message, Text } from '@aws-amplify/ui-react'
import checkCSVColumns from '../utils/checkCSVColumns'
import checkCSVNumberofRows from '../utils/checkCSVNumberofRows'
import { useGameContext } from '../contexts/GamesContext'
import { useNavigate, useParams } from 'react-router-dom'

export default function Uploader({gameId, jobId, fetchGames}) {

    const url = import.meta.env.VITE_APP_API_GATEWAY_ENDPOINT

    const [error, setError] = useState(null);
    const [files, setFiles] = useState([]);
    const [hasUploaded, setHasUploaded] = useState(false);
    const { getUploadURL, updateJob } = useGameContext()
    const navigate = useNavigate()

    const uploadFile = async () => {
        if (files.length === 0) return

        const filename = files[0].name

        try {
            await checkCSVColumns(files[0], ['id', 'review'])
            
        } catch (err) {
            setError(err.message)
            return
        }

        getUploadURL(gameId, jobId, filename)
            .then((data) => {
                const uploadUrl = data.upload_url;
                const file = files[0];
                return fetch(uploadUrl, {
                    method: 'PUT',
                    body: file,
                    headers: {
                        'Content-Type': file.type
                    }
                })
                    .then(response => {
                        if (response.ok) {
                            console.log('File uploaded successfully');
                            setHasUploaded(true)
                            // setIsShowUploadPressed(false)
                            //update game with filename
                            updateJob(gameId,jobId, { rawreviewsfilename: uploadUrl.split("?")[0] })
                            
                                .then((response) => {
                                    console.log(response)
                                    navigate(`/games/${gameId}`)
                                    
                                })
                                .catch((err) => setError(err.message));

                        } else {
                            throw new Error('File upload failed');
                        }
                    })
                    .catch(error => console.error('Error:', error));


            })
            .catch((err) => setError(err.message));
    };

    return (
        <Card variation="elevated">
            <Heading level="4">Upload CSV</Heading>
            {error && (
                <Message
                    variation="filled"
                    colorTheme="error"
                    heading="A message heading">
                    {error}
                </Message>
            )}
            <Message>
                CSV files must have an "id" and "review" column
            </Message>
            <CSVUpload files={files} setFiles={setFiles} />
            {hasUploaded && (<Text>File uploaded</Text>)}

            <Button onClick={() => uploadFile(false)} variation="primary">
                Upload
            </Button>
        </Card>
    )
}