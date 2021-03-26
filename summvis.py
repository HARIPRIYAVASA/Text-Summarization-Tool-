import argparse
import json
import operator
import os
import re
import time
from pathlib import Path
from types import SimpleNamespace

import spacy
import streamlit as st
import streamlit.components.v1 as components
from htbuilder import styles, div
from robustnessgym import Dataset, Identifier
from spacy.tokens import Doc

from align import BertscoreAligner, NGramAligner, StaticEmbeddingAligner
from components import main_view
from preprocessing import _spacy_decode, NGramAlignerCap, StaticEmbeddingAlignerCap, \
    BertscoreAlignerCap

nlp = spacy.load("en_core_web_lg")

Doc.set_extension("name", default=None, force=True)
Doc.set_extension("column", default=None, force=True)


class Instance():
    def __init__(self, id_, document, reference, preds, index=None, data=None):
        self.id = id_
        self.document = document
        self.reference = reference
        self.preds = preds
        self.index = index
        self.data = data


@st.cache
def load_from_index(filename, index):
    with open(filename) as f:
        for i, line in enumerate(f):
            if i == index:
                return json.loads(line.strip())


@st.cache(allow_output_mutation=True)
def load_dataset(path: str):
    if path.endswith('.jsonl'):
        return Dataset.from_jsonl(path)
    try:
        return Dataset.load_from_disk(path)
    except NotADirectoryError:
        return Dataset.from_jsonl(path)


def _retrieve(dataset, index):
    if index >= len(dataset):
        st.error(f"Index {index} exceeds dataset length.")

    data = dataset[index]
    id_ = data['id']

    try:
        document = _spacy_decode(
            SimpleNamespace(nlp=nlp),
            data[Identifier('Spacy')(columns=['document'])]
        )
    except KeyError:
        try:
            text = data['document']
        except KeyError:
            text = data['article']
        if not text:
            st.error("Document is blank")
            return
        document = nlp(preprocess_text(text))
    document._.name = "Document"
    document._.column = "document"

    try:
        reference = _spacy_decode(
            SimpleNamespace(nlp=nlp),
            data[Identifier('Spacy')(columns=['summary:reference'])]
        )
    except KeyError:
        try:
            text = data['summary'] if 'summary' in data else data['summary:reference']
        except KeyError:
            text = data['highlights']
        reference = nlp(preprocess_text(text))
    reference._.name = "Reference"
    reference._.column = "summary:reference"

    preds = []
    for k, v in data.items():
        if k.startswith('summary:') and k != 'summary:reference':
            try:
                pred = _spacy_decode(
                    SimpleNamespace(nlp=nlp),
                    data[Identifier('Spacy')(columns=[k])]
                )
            except KeyError:
                pred = nlp(preprocess_text(v))

            model_name = k.replace('summary:', '').upper()
            pred._.name = model_name
            pred._.column = k
            preds.append(
                pred
            )

    preds.sort(key=operator.attrgetter('_.name'))

    return Instance(
        id_=id_,
        document=document,
        reference=reference,
        preds=preds,
        index=data['index'] if 'index' in data else None,
        data=data,
    )


def retrieve(filename, index):
    data = load_from_index(filename, index)
    if not data:
        st.error(f"Row index {index} is invalid")
        return
    id_ = data['id']
    try:
        text = data['document']
    except KeyError:
        text = data['article']
    if not text:
        st.error("Document is blank")
        return
    document = nlp(preprocess_text(text))
    document._.name = "Document"

    try:
        text = data['summary']
    except KeyError:
        text = data['highlights']
    reference = nlp(preprocess_text(text))
    reference._.name = "Reference"

    preds = []
    for k, v in data.items():
        if k.endswith('_prediction'):
            model_name = k.replace('_prediction', '')
            pred = nlp(preprocess_text(v))
            pred._.name = model_name.upper()
            preds.append(
                pred
            )
    preds.sort(key=operator.attrgetter('_.name'))
    return Instance(
        id_=id_,
        document=document,
        reference=reference,
        preds=preds
    )


def preprocess_text(text):
    split_punct = re.escape(r'!"#$%&()*+,-\./:;<=>?@[\]^_`{|}~)')
    return ' '.join(re.findall(rf"[\w']+|[{split_punct}]", text))


def normalize(token):
    return token.lemma_.lower()


def select_comparison(example):
    all_summaries = [example.reference] + example.preds

    from_documents = [example.document, example.reference]
    document_names = [document._.name for document in from_documents]
    select_document_name = sidebar_placeholder_from.selectbox(
        label="Comparison FROM:",
        options=document_names
    )
    document_index = document_names.index(select_document_name)
    selected_document = from_documents[document_index]

    remaining_summaries = [summary for summary in all_summaries if
                           summary._.name != selected_document._.name]
    remaining_summary_names = [summary._.name for summary in remaining_summaries]

    selected_summary_names = sidebar_placeholder_to.multiselect(
        'Comparison TO:',
        remaining_summary_names,
        remaining_summary_names
    )
    selected_summaries = []
    for summary_name in selected_summary_names:
        summary_index = remaining_summary_names.index(summary_name)
        selected_summaries.append(remaining_summaries[summary_index])
    return selected_document, selected_summaries


def show_html(*elements, width=None, height=None, **kwargs):
    out = div(style=styles(
        **kwargs
    ))(elements)
    html = str(out)
    st.components.v1.html(html, width=width, height=height, scrolling=True)


def show_main(example):
    # Get user input

    semantic_sim_type = st.sidebar.radio(
        "Semantic similarity type:",
        ["Static embedding", "Contextual embedding"]
    )
    semantic_sim_threshold = st.sidebar.slider(
        "Semantic similarity threshold:",
        min_value=0.0,
        max_value=1.0,
        step=0.1,
        value=0.1,
    )
    semantic_sim_top_k = st.sidebar.selectbox(label="Max top-k semantic sim",
                                              options=list(range(1, 11)), index=9)

    document, summaries = select_comparison(example)
    layout = st.sidebar.radio("Layout:", ["Vertical", "Horizontal"]).lower()
    scroll = st.sidebar.checkbox(label="Scroll sections", value=True)

    # Gather data
    try:
        lexical_alignments = [
            NGramAlignerCap.decode(
                example.data[
                    Identifier(NGramAlignerCap.__name__)(
                        max_n=n,
                        columns=[
                            f'preprocessed_{document._.column}',
                            f'preprocessed_{summary._.column}',
                        ]
                    )
                ])[0]
            for summary in summaries
        ]
        lexical_alignments = [
            {k: [(pair[0], int(pair[1])) for pair in v]
             for k, v in d.items()}
            for d in lexical_alignments
        ]
    except KeyError:
        lexical_alignments = NGramAligner(n).align(document, summaries)

    if semantic_sim_type == "Static embedding":
        try:
            semantic_alignments = [
                StaticEmbeddingAlignerCap.decode(
                    example.data[
                        Identifier(StaticEmbeddingAlignerCap.__name__)(
                            threshold=semantic_sim_threshold,
                            top_k=semantic_sim_top_k,
                            columns=[
                                f'preprocessed_{document._.column}',
                                f'preprocessed_{summary._.column}',
                            ]
                        )
                    ])[0]
                for summary in summaries
            ]
        except KeyError:
            semantic_alignments = StaticEmbeddingAligner(
                semantic_sim_threshold,
                semantic_sim_top_k).align(
                document,
                summaries
            )
    else:
        try:
            semantic_alignments = [
                BertscoreAlignerCap.decode(
                    example.data[
                        Identifier(BertscoreAlignerCap.__name__)(
                            threshold=semantic_sim_threshold,
                            top_k=semantic_sim_top_k,
                            columns=[
                                f'preprocessed_{document._.column}',
                                f'preprocessed_{summary._.column}',
                            ]
                        )
                    ])[0]
                for summary in summaries
            ]
        except KeyError:
            semantic_alignments = BertscoreAligner(semantic_sim_threshold,
                                                   semantic_sim_top_k).align(document,
                                                                             summaries)

    show_html(
        *main_view(
            document,
            summaries,
            semantic_alignments,
            lexical_alignments,
            layout,
            scroll
        ),
        height=690
    )


if __name__ == "__main__":

    parser = argparse.ArgumentParser()
    parser.add_argument('--path', type=str, default='data')
    parser.add_argument('--file', type=str)
    args = parser.parse_args()

    st.set_page_config(layout="wide")
    path = Path(args.path)
    all_files = set(map(os.path.basename, path.glob('*')))
    exclude_files = set(map(os.path.basename, path.glob('*.py')))
    files = sorted(all_files - exclude_files)
    if args.file:
        try:
            file_index = files.index(args.input)
        except:
            raise FileNotFoundError(f"File not found: {args.input}")
    else:
        file_index = 0
        col1, col2 = st.beta_columns((3, 1))
    option = col1.selectbox(label="File:", options=files, index=file_index)
    filename = path / option

    query = col2.number_input("Row index:", value=0, min_value=0)

    sidebar_placeholder_from = st.sidebar.empty()
    sidebar_placeholder_to = st.sidebar.empty()

    n = 0
    n = st.sidebar.selectbox(label="Max n-gram length", options=list(range(1, 11)),
                             index=9)

    if query is not None:
        dataset = load_dataset(str(filename))
        example = _retrieve(dataset, query)
        # example = retrieve(filename, query)
        if example:
            show_main(example)
