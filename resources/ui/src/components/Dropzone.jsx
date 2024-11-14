import * as React from 'react';
import { DropZone, Text, Flex, Button, VisuallyHidden } from '@aws-amplify/ui-react';
import { useTranslation } from 'react-i18next';

export default function CSVUpload({files, setFiles}) {
    const acceptedFileTypes = ['text/csv'];
    const hiddenInput = React.useRef(null);

    const onFilePickerChange = (event) => {

        const { files } = event.target;
        if (!files || files.length === 0) {
            return;
        }
        setFiles(Array.from(files));
    };
    const { t } = useTranslation();

    return (
        <>
            <Flex direction="column">
            <DropZone
                acceptedFileTypes={['text/csv']}
                onDropComplete={({ acceptedFiles, rejectedFiles }) => {
                    setFiles(acceptedFiles);
                }}
            >
                <Flex direction="column" alignItems="center">
                    <Text>{t('dragFileHere')}</Text>
                    <Button size="small" onClick={() => hiddenInput.current.click()}>
                        {t('browse')}
                    </Button>
                </Flex>
                <VisuallyHidden>
                    <input
                        type="file"
                        tabIndex={-1}
                        ref={hiddenInput}
                        onChange={onFilePickerChange}
                        multiple={true}
                        accept={acceptedFileTypes.join(',')}
                    />
                </VisuallyHidden>
            </DropZone>
            {files.map((file) => (
                <Text key={file.name}>{file.name}</Text>
            ))}
            </Flex>
        </>
    );
}
