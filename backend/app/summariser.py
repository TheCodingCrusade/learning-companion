import os
import google.generativeai as genai
import fitz # PyMuPDF library
from dotenv import load_dotenv
import pypandoc
import tempfile

def generate_summary(transcript: str, pdf_file_path: str):
    """
    Generates a summary using the Gemini API, with context from a transcript
    and the text content of a PDF file. Converts it to a DOCX file.
    """
    print("Starting summary generation...")
    try:
        # Load the API key from the .env file
        load_dotenv(dotenv_path=os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env'))
        api_key = os.getenv("GEMINI_API_KEY")

        if not api_key:
            raise ValueError("GEMINI_API_KEY not found in .env file.")

        genai.configure(api_key=api_key)

        # 1. Extract text from the provided PDF slides
        print(f"Extracting text from PDF: {pdf_file_path}")
        slide_text = ""
        with fitz.open(pdf_file_path) as doc:
            for page in doc:
                slide_text += page.get_text() + "\n\n"
        print("PDF text extracted.")
        
        # 2. Configure the generative model
        generation_config = {
            "temperature": 0.7,
            "top_p": 1,
            "top_k": 1,
            "max_output_tokens": 8192,  # 4096 tokens -> 3000 words | 8192 tokens -> 6000 words | 16384 tokens -> 12000 words (more of a distillation of the contents and no longer a summary)
        }
        model = genai.GenerativeModel(
            model_name="models/gemini-2.5-flash-preview-05-20",
            generation_config=generation_config
        )

        # 3. Construct the prompt
        prompt_parts = [
            "You are an expert academic assistant. Your task is to create a well-structured summary, containing all the important information of the provided transcript.",
            "Use the content from the lecture slides as context to better understand the key topics and terminology.",
            "\n--- LECTURE SLIDES CONTENT ---\n",
            slide_text,
            "\n--- VIDEO TRANSCRIPT ---\n",
            transcript,
            "\n--- SUMMARY ---\n",
        ]

        # 4. Call the API and get the response
        print("Sending request to Gemini API...")
        response = model.generate_content(prompt_parts)
        markdown_text = response.text
        print("Received response from Gemini API.")
        
        # 5. Convert markdown to DOCX, saving to the temporary file path
        temp_docx_file = tempfile.NamedTemporaryFile(delete=False, suffix=".docx")
        temp_docx_path = temp_docx_file.name
        temp_docx_file.close()
        
        # 6. Convert markdown to DOCX, saving to the temporary file path
        print(f"Converting markdown to DOCX at: {temp_docx_path}")
        pypandoc.convert_text(
            markdown_text, 
            'docx', 
            format='gfm', 
            outputfile=temp_docx_path
        )
        print("Conversion complete.")
        
        # 3. Return the path to the created file
        return temp_docx_path

    except Exception as e:
        print(f"An error occurred during summarisation: {e}")
        return None
    
    finally:
        # Clean up the temporary PDF file
        if pdf_file_path and os.path.exists(pdf_file_path):
            os.remove(pdf_file_path)